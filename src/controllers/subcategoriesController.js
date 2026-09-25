const { eq, asc, desc, and, or, sql, inArray } = require('drizzle-orm');
const axios = require('axios');
const { db, pool, ensureDatabaseExists } = require('../db');
const { sportsSubcategories, sportsCategories, matches } = require('../db/schema');
const { SPORTSDB_API_KEY } = require('../services/sportsDbService');

// Helper to ensure sports_subcategories table exists
const ensureTableExists = async () => {
  await ensureDatabaseExists();
  const connection = await pool.getConnection();
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`sports_subcategories\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`category_id\` INT NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`logo_url\` TEXT,
      \`status\` TINYINT(1) NOT NULL DEFAULT 0,
      \`is_trending\` TINYINT(1) NOT NULL DEFAULT 0,
      \`is_home_banner\` TINYINT(1) NOT NULL DEFAULT 0,
      \`show_on_home\` TINYINT(1) NOT NULL DEFAULT 1,
      \`referral_link\` TEXT,
      \`display_order\` INT NOT NULL DEFAULT 0,
      \`is_customized\` TINYINT(1) NOT NULL DEFAULT 0,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  try {
    await connection.query(`
      ALTER TABLE \`sports_subcategories\` ADD COLUMN \`is_home_banner\` TINYINT(1) NOT NULL DEFAULT 0;
    `);
  } catch (err) {
    // Column already exists
  }

  try {
    await connection.query(`
      ALTER TABLE \`sports_subcategories\` ADD COLUMN \`show_on_home\` TINYINT(1) NOT NULL DEFAULT 1;
    `);
  } catch (err) {
    // Column already exists
  }

  try {
    await connection.query(`
      ALTER TABLE \`sports_subcategories\` ADD COLUMN \`referral_link\` TEXT;
    `);
  } catch (err) {
    // Column already exists
  }

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`deleted_subcategories\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`category_id\` INT NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY \`uniq_cat_name\` (\`category_id\`, \`name\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (err) {
    // Table already exists or error
  }

  connection.release();
};

// Get Subcategories (optionally filtered by categoryId, trending, or home)
const getSubcategories = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { categoryId, trending, status, activeOnly, all, admin, home } = req.query;

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfTomorrow = new Date(now);
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
    endOfTomorrow.setHours(23, 59, 59, 999);

    const queryRangeStart = new Date(startOfToday.getTime() - 14 * 3600 * 1000);
    const queryRangeEnd = new Date(endOfTomorrow.getTime() + 14 * 3600 * 1000);

    const matchCountExpr = sql`CAST(COUNT(CASE 
      WHEN ${matches.id} IS NOT NULL AND (
        ${matches.status} = 'live' 
        OR (${matches.status} != 'finished' AND ${matches.matchTime} >= ${queryRangeStart} AND ${matches.matchTime} <= ${queryRangeEnd})
      ) THEN 1 ELSE NULL END) AS UNSIGNED)`;
    const liveMatchCountExpr = sql`CAST(COUNT(CASE WHEN ${matches.id} IS NOT NULL AND ${matches.status} = 'live' THEN 1 ELSE NULL END) AS UNSIGNED)`;
    const totalMatchCountExpr = sql`CAST(COUNT(${matches.id}) AS UNSIGNED)`;

    let query = db
      .select({
        id: sportsSubcategories.id,
        categoryId: sportsSubcategories.categoryId,
        name: sportsSubcategories.name,
        logoUrl: sportsSubcategories.logoUrl,
        status: sportsSubcategories.status,
        isTrending: sportsSubcategories.isTrending,
        isHomeBanner: sportsSubcategories.isHomeBanner,
        showOnHome: sportsSubcategories.showOnHome,
        referralLink: sportsSubcategories.referralLink,
        displayOrder: sportsSubcategories.displayOrder,
        isCustomized: sportsSubcategories.isCustomized,
        createdAt: sportsSubcategories.createdAt,
        updatedAt: sportsSubcategories.updatedAt,
        categoryName: sportsCategories.sportName,
        matchCount: matchCountExpr,
        liveMatchCount: liveMatchCountExpr,
        totalMatchCount: totalMatchCountExpr,
      })
      .from(sportsSubcategories)
      .leftJoin(sportsCategories, eq(sportsSubcategories.categoryId, sportsCategories.id))
      .leftJoin(matches, eq(sportsSubcategories.id, matches.subcategoryId))
      .groupBy(
        sportsSubcategories.id,
        sportsSubcategories.categoryId,
        sportsSubcategories.name,
        sportsSubcategories.logoUrl,
        sportsSubcategories.status,
        sportsSubcategories.isTrending,
        sportsSubcategories.isHomeBanner,
        sportsSubcategories.showOnHome,
        sportsSubcategories.referralLink,
        sportsSubcategories.displayOrder,
        sportsSubcategories.isCustomized,
        sportsSubcategories.createdAt,
        sportsSubcategories.updatedAt,
        sportsCategories.sportName
      );

    const conditions = [];

    if (categoryId) {
      conditions.push(eq(sportsSubcategories.categoryId, Number(categoryId)));
    }

    const showAll = all === 'true' || all === '1' || admin === 'true';

    if (status !== undefined) {
      const statusBool = status === 'true' || status === '1';
      conditions.push(eq(sportsSubcategories.status, statusBool));
    } else if (activeOnly === 'true' || activeOnly === '1' || !showAll) {
      // By default for public website calls (when all is not passed), ONLY return active subcategories (status = true)
      conditions.push(eq(sportsSubcategories.status, true));
    }

    // Filter by Homepage visibility if home=true
    if (home === 'true' || home === '1') {
      conditions.push(eq(sportsSubcategories.showOnHome, true));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    if (trending === 'true' || trending === '1') {
      const minMatches = req.query.minMatches !== undefined ? Number(req.query.minMatches) : 10;
      // Trending/Featured subcategories:
      // Either manually marked as trending (is_trending = 1) OR automatically trending by having >= 10 active matches
      query = query.having(
        or(
          eq(sportsSubcategories.isTrending, true),
          sql`COUNT(CASE WHEN ${matches.id} IS NOT NULL AND (${matches.status} = 'live' OR (${matches.status} != 'finished' AND ${matches.matchTime} >= ${queryRangeStart} AND ${matches.matchTime} <= ${queryRangeEnd})) THEN 1 ELSE NULL END) >= ${minMatches}`
        )
      );

      // Order by: Manually pinned (isTrending DESC), then highest active matches (matchCount DESC), live matches, displayOrder, name
      query = query.orderBy(
        desc(sportsSubcategories.isTrending),
        desc(matchCountExpr),
        desc(liveMatchCountExpr),
        asc(sportsSubcategories.displayOrder),
        asc(sportsSubcategories.name)
      );
    } else {
      // General listing order: highest active matches first, then displayOrder, then name
      query = query.orderBy(
        desc(matchCountExpr),
        asc(sportsSubcategories.displayOrder),
        asc(sportsSubcategories.name)
      );
    }

    let results = await query;

    // Fallback for trending if no subcategories have matches and none are manually marked trending:
    if ((trending === 'true' || trending === '1') && results.length === 0) {
      const fallbackConditions = [eq(sportsSubcategories.status, true)];
      if (home === 'true' || home === '1') {
        fallbackConditions.push(eq(sportsSubcategories.showOnHome, true));
      }

      const fallbackQuery = db
        .select({
          id: sportsSubcategories.id,
          categoryId: sportsSubcategories.categoryId,
          name: sportsSubcategories.name,
          logoUrl: sportsSubcategories.logoUrl,
          status: sportsSubcategories.status,
          isTrending: sportsSubcategories.isTrending,
          isHomeBanner: sportsSubcategories.isHomeBanner,
          showOnHome: sportsSubcategories.showOnHome,
          referralLink: sportsSubcategories.referralLink,
          displayOrder: sportsSubcategories.displayOrder,
          isCustomized: sportsSubcategories.isCustomized,
          createdAt: sportsSubcategories.createdAt,
          updatedAt: sportsSubcategories.updatedAt,
          categoryName: sportsCategories.sportName,
          matchCount: sql`0`,
          liveMatchCount: sql`0`,
          totalMatchCount: sql`0`,
        })
        .from(sportsSubcategories)
        .leftJoin(sportsCategories, eq(sportsSubcategories.categoryId, sportsCategories.id))
        .where(and(...fallbackConditions))
        .orderBy(asc(sportsSubcategories.displayOrder), asc(sportsSubcategories.name))
        .limit(15);

      results = await fallbackQuery;
    }

    return res.status(200).json({
      success: true,
      count: results.length,
      data: {
        subcategories: results,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get Single Subcategory by ID
const getSubcategoryById = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { id } = req.params;

    const found = await db
      .select()
      .from(sportsSubcategories)
      .where(eq(sportsSubcategories.id, Number(id)))
      .limit(1);

    if (found.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Subcategory with ID ${id} not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        subcategory: found[0],
      },
    });
  } catch (error) {
    next(error);
  }
};

// Create Subcategory (Default Status: OFF, Default Trending: OFF, Default showOnHome: ON)
const createSubcategory = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { categoryId, name, logoUrl, status, isTrending, isHomeBanner, showOnHome, referralLink, displayOrder } = req.body;

    if (!categoryId || !name) {
      return res.status(400).json({
        success: false,
        message: 'Please provide categoryId and name.',
      });
    }

    const existingInDb = await db
      .select()
      .from(sportsSubcategories)
      .where(eq(sportsSubcategories.categoryId, Number(categoryId)));

    const maxOrder = existingInDb.reduce((max, item) => Math.max(max, item.displayOrder || 0), 0);

    const [result] = await db.insert(sportsSubcategories).values({
      categoryId: Number(categoryId),
      name: name.trim(),
      logoUrl: logoUrl || null,
      status: status !== undefined ? Boolean(status) : false, // Default OFF
      isTrending: isTrending !== undefined ? Boolean(isTrending) : false, // Default OFF
      isHomeBanner: isHomeBanner !== undefined ? Boolean(isHomeBanner) : false, // Default OFF
      showOnHome: showOnHome !== undefined ? Boolean(showOnHome) : true, // Default ON (true)
      referralLink: referralLink ? referralLink.trim() : null,
      displayOrder: displayOrder !== undefined ? Number(displayOrder) : maxOrder + 1,
      isCustomized: true,
    });

    // If previously marked as deleted, remove from deleted_subcategories blacklist
    try {
      await pool.query(
        'DELETE FROM deleted_subcategories WHERE category_id = ? AND LOWER(name) = ?',
        [Number(categoryId), name.trim().toLowerCase()]
      );
    } catch (unDelErr) {}

    const newSubcategory = {
      id: result.insertId,
      categoryId: Number(categoryId),
      name: name.trim(),
      logoUrl: logoUrl || null,
      status: status !== undefined ? Boolean(status) : false,
      isTrending: isTrending !== undefined ? Boolean(isTrending) : false,
      isHomeBanner: isHomeBanner !== undefined ? Boolean(isHomeBanner) : false,
      showOnHome: showOnHome !== undefined ? Boolean(showOnHome) : true,
      referralLink: referralLink ? referralLink.trim() : null,
      displayOrder: displayOrder !== undefined ? Number(displayOrder) : maxOrder + 1,
      isCustomized: true,
    };

    return res.status(201).json({
      success: true,
      message: 'Subcategory created successfully.',
      data: {
        subcategory: newSubcategory,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Update Subcategory
const updateSubcategory = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { id } = req.params;
    const { categoryId, name, logoUrl, status, isTrending, isHomeBanner, showOnHome, referralLink, displayOrder } = req.body;

    const existing = await db
      .select()
      .from(sportsSubcategories)
      .where(eq(sportsSubcategories.id, Number(id)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Subcategory with ID ${id} not found.`,
      });
    }

    await db
      .update(sportsSubcategories)
      .set({
        categoryId: categoryId !== undefined ? Number(categoryId) : existing[0].categoryId,
        name: name !== undefined ? name.trim() : existing[0].name,
        logoUrl: logoUrl !== undefined ? logoUrl : existing[0].logoUrl,
        status: status !== undefined ? Boolean(status) : existing[0].status,
        isTrending: isTrending !== undefined ? Boolean(isTrending) : existing[0].isTrending,
        isHomeBanner: isHomeBanner !== undefined ? Boolean(isHomeBanner) : existing[0].isHomeBanner,
        showOnHome: showOnHome !== undefined ? Boolean(showOnHome) : existing[0].showOnHome,
        referralLink: referralLink !== undefined ? (referralLink ? referralLink.trim() : null) : existing[0].referralLink,
        displayOrder: displayOrder !== undefined ? Number(displayOrder) : existing[0].displayOrder,
        isCustomized: true,
      })
      .where(eq(sportsSubcategories.id, Number(id)));

    // When admin disables a subcategory, delete its matches so neither the subcat nor its events show on the website
    if (status !== undefined && !Boolean(status)) {
      try {
        await db.delete(matches).where(eq(matches.subcategoryId, Number(id)));
      } catch (delErr) {
        console.error('Error removing matches for disabled subcategory:', delErr.message);
      }
    }

    const updated = await db
      .select()
      .from(sportsSubcategories)
      .where(eq(sportsSubcategories.id, Number(id)))
      .limit(1);

    return res.status(200).json({
      success: true,
      message: 'Subcategory updated successfully.',
      data: {
        subcategory: updated[0],
      },
    });
  } catch (error) {
    next(error);
  }
};

// Toggle ON / OFF Status
const toggleSubcategoryStatus = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { id } = req.params;

    const existing = await db
      .select()
      .from(sportsSubcategories)
      .where(eq(sportsSubcategories.id, Number(id)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Subcategory with ID ${id} not found.`,
      });
    }

    const newStatus = !existing[0].status;

    await db
      .update(sportsSubcategories)
      .set({
        status: newStatus,
        isCustomized: true,
      })
      .where(eq(sportsSubcategories.id, Number(id)));

    // When admin permanently disables a subcategory (status = false):
    // Delete any existing matches for this disabled subcategory from matches table
    // so they will immediately not show anywhere on website or DB!
    if (!newStatus) {
      try {
        await db.delete(matches).where(eq(matches.subcategoryId, Number(id)));
      } catch (delErr) {
        console.error('Error removing matches for disabled subcategory:', delErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Subcategory "${existing[0].name}" status toggled to ${newStatus ? 'ON (Active)' : 'OFF (Inactive)'}.`,
      data: {
        id: Number(id),
        status: newStatus,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Toggle Trending Status (is_trending = true / false)
const toggleSubcategoryTrending = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { id } = req.params;

    const existing = await db
      .select()
      .from(sportsSubcategories)
      .where(eq(sportsSubcategories.id, Number(id)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Subcategory with ID ${id} not found.`,
      });
    }

    const newTrending = !existing[0].isTrending;

    await db
      .update(sportsSubcategories)
      .set({
        isTrending: newTrending,
        isCustomized: true,
      })
      .where(eq(sportsSubcategories.id, Number(id)));

    return res.status(200).json({
      success: true,
      message: `Subcategory "${existing[0].name}" trending toggled to ${newTrending ? 'ON (Trending)' : 'OFF (Normal)'}.`,
      data: {
        id: Number(id),
        isTrending: newTrending,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Toggle Home Banner Status (is_home_banner = true / false)
const toggleSubcategoryBanner = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { id } = req.params;

    const existing = await db
      .select()
      .from(sportsSubcategories)
      .where(eq(sportsSubcategories.id, Number(id)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Subcategory with ID ${id} not found.`,
      });
    }

    const newBanner = !existing[0].isHomeBanner;

    await db
      .update(sportsSubcategories)
      .set({
        isHomeBanner: newBanner,
        isCustomized: true,
      })
      .where(eq(sportsSubcategories.id, Number(id)));

    return res.status(200).json({
      success: true,
      message: `Subcategory "${existing[0].name}" home banner set to ${newBanner ? 'ON ⭐ (Shown in Home Banner Carousel)' : 'OFF (Normal)'}.`,
      data: {
        id: Number(id),
        isHomeBanner: newBanner,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Toggle Home Visibility Status (show_on_home = true / false)
const toggleSubcategoryHome = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { id } = req.params;

    const existing = await db
      .select()
      .from(sportsSubcategories)
      .where(eq(sportsSubcategories.id, Number(id)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Subcategory with ID ${id} not found.`,
      });
    }

    const newShowOnHome = !existing[0].showOnHome;

    await db
      .update(sportsSubcategories)
      .set({
        showOnHome: newShowOnHome,
        isCustomized: true,
      })
      .where(eq(sportsSubcategories.id, Number(id)));

    return res.status(200).json({
      success: true,
      message: `Subcategory "${existing[0].name}" homepage visibility set to ${newShowOnHome ? 'ON 🏠 (Shown on Homepage)' : 'OFF (Hidden from Homepage)'}.`,
      data: {
        id: Number(id),
        showOnHome: newShowOnHome,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Delete Subcategory
const deleteSubcategory = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { id } = req.params;

    const existing = await db
      .select()
      .from(sportsSubcategories)
      .where(eq(sportsSubcategories.id, Number(id)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Subcategory with ID ${id} not found.`,
      });
    }

    const subcatName = existing[0].name.trim();
    const catId = existing[0].categoryId;

    // 1. Delete all matches belonging to this subcategory so no orphan events remain
    try {
      await db.delete(matches).where(eq(matches.subcategoryId, Number(id)));
    } catch (mErr) {
      console.error('Error removing matches for deleted subcategory:', mErr.message);
    }

    // 2. Add to deleted_subcategories blacklist so background sync & live sync NEVER recreate it!
    try {
      await pool.query(
        'INSERT IGNORE INTO deleted_subcategories (category_id, name) VALUES (?, ?)',
        [catId, subcatName.toLowerCase()]
      );
    } catch (delLogErr) {
      console.error('Error recording deleted subcategory tombstone:', delLogErr.message);
    }

    // 3. Delete the subcategory itself
    await db.delete(sportsSubcategories).where(eq(sportsSubcategories.id, Number(id)));

    return res.status(200).json({
      success: true,
      message: `Subcategory "${subcatName}" deleted permanently and removed from sync.`,
    });
  } catch (error) {
    next(error);
  }
};

// Helper to sync leagues for a single sports category
const syncSingleCategoryLeagues = async (category) => {
  const sportName = category.sportName;
  const sportsToFetch = sportName.toLowerCase() === 'hockey'
    ? ['Ice Hockey', 'Field Hockey']
    : [sportName];

  let leagues = [];
  for (const sName of sportsToFetch) {
    const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/search_all_leagues.php?s=${encodeURIComponent(sName)}`;
    try {
      const apiRes = await axios.get(url, { timeout: 10000 });
      const list = apiRes.data?.countries || apiRes.data?.countrys || apiRes.data?.leagues || [];
      if (Array.isArray(list)) {
        leagues.push(...list);
      }
    } catch (e) {}
  }

  if (leagues.length === 0) {
    return { syncedCount: 0, updatedLogosCount: 0 };
  }

  const existingSubcategories = await db
    .select()
    .from(sportsSubcategories)
    .where(eq(sportsSubcategories.categoryId, Number(category.id)));

  // Load deleted/blacklisted leagues for this category so sync never restores them
  let deletedLeaguesSet = new Set();
  try {
    const [delRows] = await pool.query(
      'SELECT name FROM deleted_subcategories WHERE category_id = ?',
      [Number(category.id)]
    );
    delRows.forEach((r) => deletedLeaguesSet.add(r.name.toLowerCase().trim()));
  } catch (delErr) {}

  const existingMap = new Map(existingSubcategories.map((s) => [s.name.toLowerCase().trim(), s]));
  let syncedCount = 0;
  let updatedLogosCount = 0;

  for (const league of leagues) {
    const name = league.strLeague?.trim();
    if (!name) continue;

    const lowerName = name.toLowerCase();

    // Skip leagues permanently deleted by admin!
    if (deletedLeaguesSet.has(lowerName)) {
      continue;
    }

    const badgeLogo = league.strBadge || league.strLogo || null;

    if (existingMap.has(lowerName)) {
      const existing = existingMap.get(lowerName);
      if (badgeLogo && (!existing.logoUrl || existing.logoUrl.includes('/event/poster/') || existing.logoUrl !== badgeLogo)) {
        await db
          .update(sportsSubcategories)
          .set({ logoUrl: badgeLogo })
          .where(eq(sportsSubcategories.id, existing.id));
        updatedLogosCount++;
      }
      continue;
    }

    await db.insert(sportsSubcategories).values({
      categoryId: Number(category.id),
      name: name,
      logoUrl: badgeLogo,
      status: true, // Default ON
      isTrending: false,
      isHomeBanner: false,
      showOnHome: true,
      referralLink: null,
      displayOrder: existingSubcategories.length + syncedCount + 1,
      isCustomized: false,
    });

    syncedCount++;
  }

  return { syncedCount, updatedLogosCount };
};

// Sync Subcategories from TheSportsDB (by Category ID or all sports categories)
const syncSubcategories = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { categoryId } = req.body;

    // If 'all' or empty, sync all sports categories
    if (!categoryId || categoryId === 'all') {
      const allCategories = await db
        .select()
        .from(sportsCategories)
        .orderBy(asc(sportsCategories.displayOrder));

      if (allCategories.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No sports categories found to sync.',
          data: { syncedCount: 0, updatedLogosCount: 0, categoriesCount: 0 },
        });
      }

      let totalSynced = 0;
      let totalUpdated = 0;

      for (const cat of allCategories) {
        try {
          const { syncedCount, updatedLogosCount } = await syncSingleCategoryLeagues(cat);
          totalSynced += syncedCount;
          totalUpdated += updatedLogosCount;
        } catch (catErr) {
          console.error(`Error syncing leagues for ${cat.sportName}:`, catErr.message);
        }
      }

      return res.status(200).json({
        success: true,
        message: `All sports categories synced successfully! Added ${totalSynced} new subcategories and updated ${totalUpdated} badges across ${allCategories.length} sports.`,
        data: { syncedCount: totalSynced, updatedLogosCount: totalUpdated, categoriesCount: allCategories.length },
      });
    }

    // Single category sync
    const category = await db
      .select()
      .from(sportsCategories)
      .where(eq(sportsCategories.id, Number(categoryId)))
      .limit(1);

    if (category.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Category with ID ${categoryId} not found.`,
      });
    }

    const { syncedCount, updatedLogosCount } = await syncSingleCategoryLeagues(category[0]);

    return res.status(200).json({
      success: true,
      message: `Successfully processed "${category[0].sportName}": ${syncedCount} new subcategories added, ${updatedLogosCount} badges updated.`,
      data: { syncedCount, updatedLogosCount },
    });
  } catch (error) {
    next(error);
  }
};

// Bulk Update Subcategory (Status, Home Visibility, Banner, Trending by Category or IDs)
const bulkUpdateSubcategoryStatus = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { categoryId, ids, status, type = 'status', value } = req.body;

    let whereClause;
    if (Array.isArray(ids) && ids.length > 0) {
      whereClause = inArray(sportsSubcategories.id, ids.map(Number));
    } else if (categoryId && categoryId !== 'all') {
      whereClause = eq(sportsSubcategories.categoryId, Number(categoryId));
    } else if (categoryId === 'all') {
      whereClause = undefined;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide categoryId or ids array.',
      });
    }

    // Determine what field to update:
    // Support type: 'status' | 'home' | 'banner' | 'trending'
    // or explicit keys: showOnHome, isHomeBanner, isTrending, status
    const updateData = { isCustomized: true };
    let actionName = 'Status';
    let targetVal = true;

    if (type === 'home' || req.body.showOnHome !== undefined) {
      targetVal = value !== undefined ? Boolean(value) : (req.body.showOnHome !== undefined ? Boolean(req.body.showOnHome) : Boolean(status));
      updateData.showOnHome = targetVal;
      actionName = `Homepage visibility set to ${targetVal ? 'ON (Shown on Home)' : 'OFF (Hidden from Home)'}`;
    } else if (type === 'banner' || req.body.isHomeBanner !== undefined) {
      targetVal = value !== undefined ? Boolean(value) : (req.body.isHomeBanner !== undefined ? Boolean(req.body.isHomeBanner) : Boolean(status));
      updateData.isHomeBanner = targetVal;
      actionName = `Home banner set to ${targetVal ? 'ON (Shown in Carousel)' : 'OFF'}`;
    } else if (type === 'trending' || req.body.isTrending !== undefined) {
      targetVal = value !== undefined ? Boolean(value) : (req.body.isTrending !== undefined ? Boolean(req.body.isTrending) : Boolean(status));
      updateData.isTrending = targetVal;
      actionName = `Trending set to ${targetVal ? 'ON (Trending)' : 'OFF'}`;
    } else {
      targetVal = Boolean(status);
      updateData.status = targetVal;
      actionName = `Status set to ${targetVal ? 'ON (Active)' : 'OFF (Inactive)'}`;
    }

    if (whereClause) {
      await db.update(sportsSubcategories).set(updateData).where(whereClause);
    } else {
      await db.update(sportsSubcategories).set(updateData);
    }

    // If disabling, delete matches for these subcategories so website & DB are clean
    if (updateData.status === false) {
      try {
        if (Array.isArray(ids) && ids.length > 0) {
          await db.delete(matches).where(inArray(matches.subcategoryId, ids.map(Number)));
        } else if (categoryId && categoryId !== 'all') {
          await db.delete(matches).where(eq(matches.categoryId, Number(categoryId)));
        } else if (categoryId === 'all') {
          await db.delete(matches);
        }
      } catch (delErr) {
        console.error('Error deleting matches on bulk disable:', delErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Subcategories successfully updated: ${actionName}.`,
    });
  } catch (error) {
    next(error);
  }
};

// Core reusable function to sync and repair all subcategory badges from TheSportsDB
const syncAllSubcategoryBadgesCore = async () => {
  await ensureTableExists();
  const categories = await db.select().from(sportsCategories);
  const subcats = await db.select().from(sportsSubcategories);

  const subcatMap = new Map();
  subcats.forEach((s) => subcatMap.set(s.name.toLowerCase().trim(), s));

  let updatedCount = 0;

  for (const cat of categories) {
    try {
      const sportsToFetch = cat.sportName.toLowerCase() === 'hockey'
        ? ['Ice Hockey', 'Field Hockey']
        : [cat.sportName];

      for (const sName of sportsToFetch) {
        const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/search_all_leagues.php?s=${encodeURIComponent(sName)}`;
        const apiRes = await axios.get(url, { timeout: 10000 });
        const list = apiRes.data?.countries || apiRes.data?.countrys || apiRes.data?.leagues || [];

        for (const item of list) {
          const leagueName = item.strLeague?.trim();
          if (!leagueName) continue;

          const badgeLogo = item.strBadge || item.strLogo || null;
          if (!badgeLogo) continue;

          const existing = subcatMap.get(leagueName.toLowerCase());
          if (existing && (!existing.logoUrl || existing.logoUrl.includes('/event/poster/') || existing.logoUrl !== badgeLogo)) {
            await db
              .update(sportsSubcategories)
              .set({ logoUrl: badgeLogo })
              .where(eq(sportsSubcategories.id, existing.id));
            updatedCount++;
            existing.logoUrl = badgeLogo;
          }
        }
      }
    } catch (err) {
      // ignore
    }
  }

  return { updatedCount };
};

// Express Route Controller: Sync and Repair All Subcategory Badges
const syncAllSubcategoryBadges = async (req, res, next) => {
  try {
    const result = await syncAllSubcategoryBadgesCore();
    return res.status(200).json({
      success: true,
      message: `All subcategory badges synced successfully! Updated ${result.updatedCount} badges from TheSportsDB.`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSubcategories,
  getSubcategoryById,
  createSubcategory,
  updateSubcategory,
  toggleSubcategoryStatus,
  toggleSubcategoryTrending,
  toggleSubcategoryBanner,
  toggleSubcategoryHome,
  deleteSubcategory,
  syncSubcategories,
  syncAllSubcategoryBadges,
  syncAllSubcategoryBadgesCore,
  bulkUpdateSubcategoryStatus,
};
