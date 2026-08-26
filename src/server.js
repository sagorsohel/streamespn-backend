require('dotenv').config();
const app = require('./app');
const { pool } = require('./db');

const PORT = process.env.PORT || 5000;

// Test DB Connection and start server
const startServer = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully via MySQL connection pool!');
    connection.release();

    app.listen(PORT, () => {
      console.log(`🚀 StreamESPN Backend Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
      console.log(`📡 Health check URL: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error.message);
    console.log('⚠️ Server started without DB connection. Update your .env file with correct MySQL credentials.');

    app.listen(PORT, () => {
      console.log(`🚀 StreamESPN Backend Server running on port ${PORT}`);
    });
  }
};

startServer();
