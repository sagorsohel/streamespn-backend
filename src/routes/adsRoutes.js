const express = require('express');
const { getAdsFast, getAdsSettings, updateAdsSettings } = require('../controllers/adsController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.get('/fast', getAdsFast);
router.get('/', getAdsSettings);
router.put('/', verifyToken, updateAdsSettings);

module.exports = router;
