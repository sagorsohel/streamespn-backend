const { drizzle } = require('drizzle-orm/mysql2');
const mysql = require('mysql2/promise');
const schema = require('./schema');
require('dotenv').config();

const dbHost = process.env.DB_HOST || '127.0.0.1';
const dbUser = process.env.DB_USER || 'root';
const dbPassword = process.env.DB_PASSWORD || '';
const dbName = process.env.DB_NAME || 'streamespn_db';
const dbPort = Number(process.env.DB_PORT) || 3306;

// Helper to ensure database exists before establishing pool connections
const ensureDatabaseExists = async () => {
  try {
    const connection = await mysql.createConnection({
      host: dbHost,
      user: dbUser,
      password: dbPassword,
      port: dbPort,
    });
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    await connection.end();
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
  connectionLimit: 10,
  queueLimit: 0,
});

const db = drizzle(pool, { schema, mode: 'default' });

module.exports = {
  db,
  pool,
  ensureDatabaseExists,
};
