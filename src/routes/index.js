const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const sportsRoutes = require('./sportsRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/sports', sportsRoutes);

module.exports = router;
