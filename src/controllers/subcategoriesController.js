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

  connection.release();
};

// Get Subcategories (optionally filtered by categoryId or trending)
const getSubcategories = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { categoryId, trending, status, activeOnly, all, admin } = req.query;

    const matchCountExpr = sql`CAST(COUNT(CASE WHEN ${matches.id} IS NOT NULL AND (${matches.status} != 'finished' OR ${matches.status} IS NULL) THEN 1 ELSE NULL END) AS UNSIGNED)`;
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
          sql`COUNT(CASE WHEN ${matches.id} IS NOT NULL AND (${matches.status} != 'finished' OR ${matches.status} IS NULL) THEN 1 ELSE NULL END) >= ${minMatches}`
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
      const fallbackQuery = db
        .select({
          id: sportsSubcategories.id,
          categoryId: sportsSubcategories.categoryId,
          name: sportsSubcategories.name,
          logoUrl: sportsSubcategories.logoUrl,
          status: sportsSubcategories.status,
          isTrending: sportsSubcategories.isTrending,
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
        .where(eq(sportsSubcategories.status, true))
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

// Create Subcategory (Default Status: OFF, Default Trending: OFF)
const createSubcategory = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { categoryId, name, logoUrl, status, isTrending, displayOrder } = req.body;

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
      displayOrder: displayOrder !== undefined ? Number(displayOrder) : maxOrder + 1,
      isCustomized: true,
    });

    const newSubcategory = {
      id: result.insertId,
      categoryId: Number(categoryId),
      name: name.trim(),
      logoUrl: logoUrl || null,
      status: status !== undefined ? Boolean(status) : false,
      isTrending: isTrending !== undefined ? Boolean(isTrending) : false,
      displayOrder: displayOrder !== undefined ? Number(displayOrder) : maxOrder + 1,
      isCustomized: true,
    };

    return res.status(201).json({
      success: true,
      message: 'Subcategory created successfully (Default Status & Trending: OFF).',
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
    const { categoryId, name, logoUrl, status, isTrending, displayOrder } = req.body;

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

    await db.delete(sportsSubcategories).where(eq(sportsSubcategories.id, Number(id)));

    return res.status(200).json({
      success: true,
      message: `Subcategory "${existing[0].name}" deleted successfully.`,
    });
  } catch (error) {
    next(error);
  }
};

// Sync Subcategories from TheSportsDB (by Category ID or Sport Name)
const syncSubcategories = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { categoryId } = req.body;

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide categoryId to sync.',
      });
    }

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

    const sportName = category[0].sportName;
    const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/search_all_leagues.php?s=${encodeURIComponent(sportName)}`;
    
    const apiRes = await axios.get(url);
    const leagues = apiRes.data?.countrys || apiRes.data?.leagues || [];

    if (!Array.isArray(leagues) || leagues.length === 0) {
      return res.status(200).json({
        success: true,
        message: `No leagues found for sport "${sportName}" on TheSportsDB.`,
        data: { syncedCount: 0 },
      });
    }

    const existingSubcategories = await db
      .select()
      .from(sportsSubcategories)
      .where(eq(sportsSubcategories.categoryId, Number(categoryId)));

    const existingNames = new Set(existingSubcategories.map((s) => s.name.toLowerCase()));
    let syncedCount = 0;

    for (const league of leagues) {
      const name = league.strLeague;
      if (!name || existingNames.has(name.toLowerCase())) continue;

      const logoUrl = league.strBadge || league.strLogo || league.strPoster || null;

      await db.insert(sportsSubcategories).values({
        categoryId: Number(categoryId),
        name: name.trim(),
        logoUrl: logoUrl,
        status: false, // Default OFF
        isTrending: false, // Default OFF
        displayOrder: existingSubcategories.length + syncedCount + 1,
        isCustomized: false,
      });

      syncedCount++;
    }

    return res.status(200).json({
      success: true,
      message: `Successfully synced ${syncedCount} new subcategories for "${sportName}".`,
      data: { syncedCount },
    });
  } catch (error) {
    next(error);
  }
};

// Bulk Update Subcategory Status (Enable All or Disable All by Category or IDs)
const bulkUpdateSubcategoryStatus = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { categoryId, ids, status } = req.body;
    const targetStatus = Boolean(status);

    let whereClause;
    if (Array.isArray(ids) && ids.length > 0) {
      whereClause = inArray(sportsSubcategories.id, ids.map(Number));
    } else if (categoryId && categoryId !== 'all') {
      whereClause = eq(sportsSubcategories.categoryId, Number(categoryId));
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide categoryId or ids array.',
      });
    }

    await db
      .update(sportsSubcategories)
      .set({
        status: targetStatus,
        isCustomized: true,
      })
      .where(whereClause);

    // If disabling, delete matches for these subcategories so website & DB are clean
    if (!targetStatus) {
      try {
        if (Array.isArray(ids) && ids.length > 0) {
          await db.delete(matches).where(inArray(matches.subcategoryId, ids.map(Number)));
        } else if (categoryId && categoryId !== 'all') {
          await db.delete(matches).where(eq(matches.categoryId, Number(categoryId)));
        }
      } catch (delErr) {
        console.error('Error deleting matches on bulk disable:', delErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Subcategories successfully ${targetStatus ? 'enabled (ON)' : 'disabled (OFF)'}.`,
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
  deleteSubcategory,
  syncSubcategories,
  bulkUpdateSubcategoryStatus,
};
