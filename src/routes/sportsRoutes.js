const express = require('express');
const {
  syncSports,
  getSports,
  getSportById,
  createSport,
  updateSport,
  deleteSport,
  reorderSports,
} = require('../controllers/sportsController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.post('/sync', syncSports);
router.get('/', getSports);
router.get('/:id', getSportById);
router.post('/', verifyToken, createSport);
router.put('/reorder', verifyToken, reorderSports);
router.put('/:id', verifyToken, updateSport);
router.delete('/:id', verifyToken, deleteSport);

module.exports = router;
