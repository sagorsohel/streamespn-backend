const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

// Disable ETag to prevent HTTP 304 empty body responses on API endpoints
app.set('etag', false);

// Default Cache-Control for mutations, allow GET endpoints to set their own cache headers
app.use((req, res, next) => {
  if (req.method !== 'GET') {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  next();
});

// Security and middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'StreamESPN Backend API is running smoothly.',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api', routes);

// Error Handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
