const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const sportsRoutes = require('./sportsRoutes');
const subcategoriesRoutes = require('./subcategoriesRoutes');
const matchesRoutes = require('./matchesRoutes');
const adsRoutes = require('./adsRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/sports', sportsRoutes);
router.use('/subcategories', subcategoriesRoutes);
router.use('/matches', matchesRoutes);
router.use('/ads', adsRoutes);

module.exports = router;
