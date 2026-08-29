const express = require('express');
const {
  getMatches,
  getMatchById,
  getLiveScores,
  createMatch,
  updateMatch,
  deleteMatch,
  deleteAllMatches,
  reorderMatches,
  syncMatches,
} = require('../controllers/matchesController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', getMatches);
router.get('/live-scores', getLiveScores);
router.get('/:id', getMatchById);
router.post('/', verifyToken, createMatch);
router.post('/sync', verifyToken, syncMatches);
router.put('/reorder', verifyToken, reorderMatches);
router.put('/:id', verifyToken, updateMatch);
router.delete('/all', verifyToken, deleteAllMatches);
router.delete('/:id', verifyToken, deleteMatch);

module.exports = router;
