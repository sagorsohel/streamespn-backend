const express = require('express');
const { getAdsSettings, updateAdsSettings } = require('../controllers/adsController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', getAdsSettings);
router.put('/', verifyToken, updateAdsSettings);

module.exports = router;
