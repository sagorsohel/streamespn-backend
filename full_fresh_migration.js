const { pool, ensureDatabaseExists } = require('./src/db');
const { syncMatchesCore } = require('./src/controllers/matchesController');
const { getTargetSportsFiltered } = require('./src/services/sportsDbService');
const { db } = require('./src/db');
const { sportsCategories, sportsSubcategories, matches } = require('./src/db/schema');
const { eq } = require('drizzle-orm');

const runFullFreshMigration = async () => {
  console.log('🚀 [MIGRATION] Starting full database migration and fresh import...');

  try {
    await ensureDatabaseExists();
    const connection = await pool.getConnection();

    // 1. Ensure Table Schemas Exist
    console.log('🛠️ [MIGRATION] Ensuring database table schemas...');
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

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`sports_subcategories\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`category_id\` INT NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`logo_url\` TEXT,
        \`description\` TEXT,
        \`status\` TINYINT(1) NOT NULL DEFAULT 1,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`matches\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`sportsdb_event_id\` VARCHAR(100),
        \`category_id\` INT NOT NULL,
        \`subcategory_id\` INT,
        \`match_type\` ENUM('team_vs_team', 'title_event') NOT NULL DEFAULT 'team_vs_team',
        \`slug\` VARCHAR(255),
        \`title\` VARCHAR(255),
        \`home_team\` VARCHAR(255),
        \`home_team_logo\` TEXT,
        \`away_team\` VARCHAR(255),
        \`away_team_logo\` TEXT,
        \`home_score\` VARCHAR(20),
        \`away_score\` VARCHAR(20),
        \`live_period\` VARCHAR(50),
        \`live_minute\` VARCHAR(50),
        \`match_time\` DATETIME NOT NULL,
        \`status\` ENUM('upcoming', 'live', 'finished') NOT NULL DEFAULT 'upcoming',
        \`venue\` VARCHAR(255),
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

    // 2. Re-Sync Sports Categories
    console.log('🏆 [MIGRATION] Syncing sports categories from API...');
    const apiSports = await getTargetSportsFiltered();
    if (apiSports && apiSports.length > 0) {
      const existingCats = await db.select().from(sportsCategories);
      const existingMap = new Map(existingCats.map((c) => [c.sportName.toLowerCase().trim(), c]));
      let maxOrder = existingCats.reduce((max, item) => Math.max(max, item.displayOrder || 0), 0);

      for (const item of apiSports) {
        const name = (item.strSport || item.name || '').trim();
        if (!name) continue;
        const lowerName = name.toLowerCase();

        if (!existingMap.has(lowerName)) {
          maxOrder++;
          await db.insert(sportsCategories).values({
            sportName: name,
            sportFormat: item.strFormat || 'Team',
            thumbUrl: item.strSportThumb || null,
            iconUrl: item.strSportIconGreen || null,
            description: item.strSportDescription || null,
            displayOrder: maxOrder,
            isCustomized: false,
          });
        }
      }
    }

    // 3. Sync Matches and Subcategories for Today & Tomorrow
    console.log('⚽ [MIGRATION] Importing fresh live & upcoming matches from SportsDB...');
    const syncResult = await syncMatchesCore();
    console.log('📊 [MIGRATION] Sync result:', syncResult);

    console.log('✅ [MIGRATION] Full migration and fresh import completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ [MIGRATION] Migration error:', err);
    process.exit(1);
  }
};

runFullFreshMigration();
