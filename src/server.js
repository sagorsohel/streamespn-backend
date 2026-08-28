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

    // 3. Start automated daily 12:00 AM (Midnight) match sync scheduler
    const { startDaily12AMScheduler } = require('./controllers/matchesController');
    startDaily12AMScheduler();

    // 4. Start server with automatic port fallback if port is in use
    const startListening = (portToTry) => {
      const server = app.listen(portToTry, () => {
        console.log(`🚀 StreamESPN Backend Server running in ${process.env.NODE_ENV || 'development'} mode on port ${portToTry}`);
        console.log(`📡 Health check URL: http://localhost:${portToTry}/health`);
      });

      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.warn(`⚠️ Port ${portToTry} is already in use. Retrying on port ${Number(portToTry) + 1}...`);
          startListening(Number(portToTry) + 1);
        } else {
          console.error('❌ Server error:', error.message);
        }
      });
    };

    startListening(PORT);
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error.message);
    console.log('⚠️ Update your .env file with correct MySQL credentials and ensure MySQL service is running.');
  }
};

startServer();
