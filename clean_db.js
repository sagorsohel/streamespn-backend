const { pool, ensureDatabaseExists } = require('./src/db');

const cleanDb = async () => {
  try {
    await ensureDatabaseExists();
    const connection = await pool.getConnection();
    
    console.log('Cleaning all matches from database...');
    await connection.query('DELETE FROM `matches`;');
    await connection.query('UPDATE `sports_subcategories` SET `status` = 0;');
    
    connection.release();
    console.log('✅ Successfully removed all matches and reset subcategory statuses!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error cleaning database:', err);
    process.exit(1);
  }
};

cleanDb();
