const { eq, asc } = require('drizzle-orm');
const { db, pool, ensureDatabaseExists } = require('../db');
const { sportsCategories } = require('../db/schema');
const { getTargetSportsFiltered } = require('../services/sportsDbService');

// Helper to ensure table exists in MySQL before running queries
const ensureTableExists = async () => {
  await ensureDatabaseExists();
  const connection = await pool.getConnection();
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`sports_categories\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`sport_name\` VARCHAR(255) NOT NULL,
      \`sport_format\` VARCHAR(100) DEFAULT 'Team',
      \`thumb_url\` TEXT,
      \`icon_url\` TEXT,
      \`description\` TEXT,
      \`player_image\` TEXT,
      \`bg_image\` TEXT,
      \`referral_link\` TEXT,
      \`display_order\` INT NOT NULL DEFAULT 0,
      \`is_customized\` TINYINT(1) NOT NULL DEFAULT 0,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  connection.release();
};

// Sync Sports Categories from TheSportsDB API
const syncSports = async (req, res, next) => {
  try {
    await ensureTableExists();
    const apiSports = await getTargetSportsFiltered();

    if (!apiSports || apiSports.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No sports data returned from TheSportsDB API.',
      });
    }

    const existingInDb = await db.select().from(sportsCategories);
    const existingMap = new Map();
    existingInDb.forEach((item) => {
      existingMap.set(item.sportName.toLowerCase().trim(), item);
    });

    let addedCount = 0;
    let updatedCount = 0;
    let preservedCount = 0;

    let maxOrder = existingInDb.reduce((max, item) => Math.max(max, item.displayOrder || 0), 0);

    for (const item of apiSports) {
      const name = (item.strSport || item.name || '').trim();
      if (!name) continue;

      const lowerName = name.toLowerCase();
      const existing = existingMap.get(lowerName);

      if (existing) {
        // PROTECTION GUARANTEE: If admin modified this category, DO NOT overwrite!
        if (existing.isCustomized) {
          preservedCount++;
          continue;
        }

        // Update non-customized category
        await db
          .update(sportsCategories)
          .set({
            sportFormat: item.strFormat || existing.sportFormat || 'Team',
            thumbUrl: item.strSportThumb || existing.thumbUrl,
            iconUrl: item.strSportIconGreen || existing.iconUrl,
            description: item.strSportDescription || existing.description,
          })
          .where(eq(sportsCategories.id, existing.id));

        updatedCount++;
      } else {
        // Insert new category
        maxOrder++;
        await db.insert(sportsCategories).values({
          sportName: name,
          sportFormat: item.strFormat || 'Team',
          thumbUrl: item.strSportThumb || null,
          iconUrl: item.strSportIconGreen || null,
          description: item.strSportDescription || null,
          playerImage: null,
          bgImage: null,
          referralLink: null,
          displayOrder: maxOrder,
          isCustomized: false,
        });

        addedCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Sync completed! Added: ${addedCount}, Updated: ${updatedCount}, Preserved (Admin Locked): ${preservedCount}.`,
      data: {
        added: addedCount,
        updated: updatedCount,
        preserved: preservedCount,
        totalInApi: apiSports.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get All Sports Categories (sorted by displayOrder)
const getSports = async (req, res, next) => {
  try {
    await ensureTableExists();
    const categories = await db
      .select()
      .from(sportsCategories)
      .orderBy(asc(sportsCategories.displayOrder));

    return res.status(200).json({
      success: true,
      count: categories.length,
      data: {
        sports: categories,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get Single Sport Category by ID
const getSportById = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { id } = req.params;

    const found = await db
      .select()
      .from(sportsCategories)
      .where(eq(sportsCategories.id, Number(id)))
      .limit(1);

    if (found.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Sport category with ID ${id} not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        sport: found[0],
      },
    });
  } catch (error) {
    next(error);
  }
};

// Create Custom Sport Category
const createSport = async (req, res, next) => {
  try {
    await ensureTableExists();
    const {
      sportName,
      sportFormat,
      thumbUrl,
      iconUrl,
      description,
      playerImage,
      bgImage,
      referralLink,
      displayOrder,
    } = req.body;

    if (!sportName) {
      return res.status(400).json({
        success: false,
        message: 'Sport name is required.',
      });
    }

    const existingInDb = await db.select().from(sportsCategories);
    const maxOrder = existingInDb.reduce((max, item) => Math.max(max, item.displayOrder || 0), 0);

    const [result] = await db.insert(sportsCategories).values({
      sportName,
      sportFormat: sportFormat || 'Team',
      thumbUrl: thumbUrl || null,
      iconUrl: iconUrl || null,
      description: description || null,
      playerImage: playerImage || null,
      bgImage: bgImage || null,
      referralLink: referralLink || null,
      displayOrder: displayOrder !== undefined ? Number(displayOrder) : maxOrder + 1,
      isCustomized: true, // Marked as customized so API sync won't touch it
    });

    const newSport = {
      id: result.insertId,
      sportName,
      sportFormat: sportFormat || 'Team',
      thumbUrl,
      iconUrl,
      description,
      playerImage,
      bgImage,
      referralLink,
      displayOrder: displayOrder !== undefined ? Number(displayOrder) : maxOrder + 1,
      isCustomized: true,
    };

    return res.status(201).json({
      success: true,
      message: 'Custom sport category created successfully.',
      data: {
        sport: newSport,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Update Sport Category (Marks isCustomized = true)
const updateSport = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { id } = req.params;
    const {
      sportName,
      sportFormat,
      thumbUrl,
      iconUrl,
      description,
      playerImage,
      bgImage,
      referralLink,
      displayOrder,
    } = req.body;

    const existing = await db
      .select()
      .from(sportsCategories)
      .where(eq(sportsCategories.id, Number(id)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Sport category with ID ${id} not found.`,
      });
    }

    await db
      .update(sportsCategories)
      .set({
        sportName: sportName !== undefined ? sportName : existing[0].sportName,
        sportFormat: sportFormat !== undefined ? sportFormat : existing[0].sportFormat,
        thumbUrl: thumbUrl !== undefined ? thumbUrl : existing[0].thumbUrl,
        iconUrl: iconUrl !== undefined ? iconUrl : existing[0].iconUrl,
        description: description !== undefined ? description : existing[0].description,
        playerImage: playerImage !== undefined ? playerImage : existing[0].playerImage,
        bgImage: bgImage !== undefined ? bgImage : existing[0].bgImage,
        referralLink: referralLink !== undefined ? referralLink : existing[0].referralLink,
        displayOrder: displayOrder !== undefined ? Number(displayOrder) : existing[0].displayOrder,
        isCustomized: true, // Lock category against sync overwrites
      })
      .where(eq(sportsCategories.id, Number(id)));

    const updated = await db
      .select()
      .from(sportsCategories)
      .where(eq(sportsCategories.id, Number(id)))
      .limit(1);

    return res.status(200).json({
      success: true,
      message: 'Sport category updated and locked against sync overwrites.',
      data: {
        sport: updated[0],
      },
    });
  } catch (error) {
    next(error);
  }
};

// Delete Sport Category
const deleteSport = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { id } = req.params;

    const existing = await db
      .select()
      .from(sportsCategories)
      .where(eq(sportsCategories.id, Number(id)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Sport category with ID ${id} not found.`,
      });
    }

    await db.delete(sportsCategories).where(eq(sportsCategories.id, Number(id)));

    return res.status(200).json({
      success: true,
      message: `Sport category "${existing[0].sportName}" deleted successfully.`,
    });
  } catch (error) {
    next(error);
  }
};

// Reorder Sports Categories (Bulk update displayOrder / serial)
const reorderSports = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { items } = req.body; // Array of { id, displayOrder }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of items with { id, displayOrder }.',
      });
    }

    for (const item of items) {
      if (item.id && item.displayOrder !== undefined) {
        await db
          .update(sportsCategories)
          .set({ displayOrder: Number(item.displayOrder) })
          .where(eq(sportsCategories.id, Number(item.id)));
      }
    }

    const categories = await db
      .select()
      .from(sportsCategories)
      .orderBy(asc(sportsCategories.displayOrder));

    return res.status(200).json({
      success: true,
      message: 'Sports categories reordered successfully.',
      data: {
        sports: categories,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  syncSports,
  getSports,
  getSportById,
  createSport,
  updateSport,
  deleteSport,
  reorderSports,
};
