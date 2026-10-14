const { drizzle } = require('drizzle-orm/mysql2');
const mysql = require('mysql2/promise');
const schema = require('./schema');
require('dotenv').config();

const dbHost = process.env.DB_HOST || '127.0.0.1';
const dbUser = process.env.DB_USER || 'root';
const dbPassword = process.env.DB_PASSWORD || '';
const dbName = process.env.DB_NAME || 'streamespn_db';
const dbPort = Number(process.env.DB_PORT) || 3306;

let dbExistsChecked = false;

// Helper to ensure database exists before establishing pool connections
const ensureDatabaseExists = async (force = false) => {
  if (dbExistsChecked && !force) return;
  try {
    const connection = await mysql.createConnection({
      host: dbHost,
      user: dbUser,
      password: dbPassword,
      port: dbPort,
    });
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    await connection.end();
    dbExistsChecked = true;
  } catch (error) {
    // If DB server isn't running yet or auth fails, error will be handled on server start
  }
};

const pool = mysql.createPool({
  host: dbHost,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  port: dbPort,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
});

const db = drizzle(pool, { schema, mode: 'default' });

let indexesChecked = false;
const ensureDatabaseIndexes = async () => {
  if (indexesChecked) return;
  try {
    const connection = await pool.getConnection();
    const createIndexIfNotExists = async (table, indexName, columns) => {
      try {
        const [rows] = await connection.query(
          `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
          [dbName, table, indexName]
        );
        if (rows.length === 0) {
          await connection.query(`CREATE INDEX \`${indexName}\` ON \`${table}\` (${columns})`);
          console.log(`⚡ [DB INDEX] Created index ${indexName} on ${table}`);
        }
      } catch (e) {
        // Table might not exist yet or index already created
      }
    };

    // Indexes for matches table (drastically speeds up home page, banner, and live query filters)
    await createIndexIfNotExists('matches', 'idx_matches_status_matchtime', '`status`, `match_time`');
    await createIndexIfNotExists('matches', 'idx_matches_category_id', '`category_id`');
    await createIndexIfNotExists('matches', 'idx_matches_subcategory_id', '`subcategory_id`');
    await createIndexIfNotExists('matches', 'idx_matches_status', '`status`');
    await createIndexIfNotExists('matches', 'idx_matches_match_time', '`match_time`');
    await createIndexIfNotExists('matches', 'idx_matches_display_order', '`display_order`');

    // Indexes for sports_subcategories table
    await createIndexIfNotExists('sports_subcategories', 'idx_subcats_status_home', '`status`, `show_on_home`');
    await createIndexIfNotExists('sports_subcategories', 'idx_subcats_category_id', '`category_id`');
    await createIndexIfNotExists('sports_subcategories', 'idx_subcats_trending', '`is_trending`');
    await createIndexIfNotExists('sports_subcategories', 'idx_subcats_home_banner', '`is_home_banner`');
    await createIndexIfNotExists('sports_subcategories', 'idx_subcats_display_order', '`display_order`');

    // Indexes for sports_categories
    await createIndexIfNotExists('sports_categories', 'idx_categories_display_order', '`display_order`');

    connection.release();
    indexesChecked = true;
  } catch (err) {
    // Non-fatal
  }
};

module.exports = {
  db,
  pool,
  ensureDatabaseExists,
  ensureDatabaseIndexes,
};
