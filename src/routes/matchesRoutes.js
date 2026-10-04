const express = require('express');
const {
  getMatches,
  getBannerMatches,
  getMatchById,
  getLiveScores,
  createMatch,
  updateMatch,
  deleteMatch,
  deleteAllMatches,
  reorderMatches,
  syncMatches,
  syncChinaOpenMatches,
} = require('../controllers/matchesController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', getMatches);
router.get('/banner', getBannerMatches);
router.get('/live-scores', getLiveScores);
router.post('/sync-china-open', verifyToken, syncChinaOpenMatches);
router.get('/sync-china-open', syncChinaOpenMatches); // allow automated cron/webhook triggers
router.get('/:id', getMatchById);
router.post('/', verifyToken, createMatch);
router.post('/sync', verifyToken, syncMatches);
router.put('/reorder', verifyToken, reorderMatches);
router.put('/:id', verifyToken, updateMatch);
router.delete('/all', verifyToken, deleteAllMatches);
router.delete('/:id', verifyToken, deleteMatch);

module.exports = router;
