const express = require('express');
const {
  getMatches,
  getMatchById,
  createMatch,
  updateMatch,
  deleteMatch,
  reorderMatches,
  syncMatches,
} = require('../controllers/matchesController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', getMatches);
router.get('/:id', getMatchById);
router.post('/', verifyToken, createMatch);
router.post('/sync', verifyToken, syncMatches);
router.put('/reorder', verifyToken, reorderMatches);
router.put('/:id', verifyToken, updateMatch);
router.delete('/:id', verifyToken, deleteMatch);

module.exports = router;
