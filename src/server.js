require('dotenv').config();
const app = require('./app');
const { pool, ensureDatabaseExists } = require('./db');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // 1. Ensure database exists
    await ensureDatabaseExists();

    // 2. Check DB connection
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully via MySQL pool!');
    connection.release();

    // 3. Start server
    const server = app.listen(PORT, () => {
      console.log(`🚀 StreamESPN Backend Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
      console.log(`📡 Health check URL: http://localhost:${PORT}/health`);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please stop the running process or change PORT in .env`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', error.message);
      }
    });

  } catch (error) {
    console.error('❌ Unable to connect to the database:', error.message);
    console.log('⚠️ Update your .env file with correct MySQL credentials and ensure MySQL service is running.');
  }
};

startServer();
