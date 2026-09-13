const express = require('express');
const {
  getSubcategories,
  getSubcategoryById,
  createSubcategory,
  updateSubcategory,
  toggleSubcategoryStatus,
  toggleSubcategoryTrending,
  toggleSubcategoryBanner,
  toggleSubcategoryHome,
  deleteSubcategory,
  syncSubcategories,
  syncAllSubcategoryBadges,
  bulkUpdateSubcategoryStatus,
} = require('../controllers/subcategoriesController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', getSubcategories);
router.get('/:id', getSubcategoryById);
router.post('/', verifyToken, createSubcategory);
router.post('/sync', verifyToken, syncSubcategories);
router.post('/sync-all-badges', verifyToken, syncAllSubcategoryBadges);
router.post('/bulk-status', verifyToken, bulkUpdateSubcategoryStatus);
router.patch('/:id/toggle', verifyToken, toggleSubcategoryStatus);
router.patch('/:id/toggle-trending', verifyToken, toggleSubcategoryTrending);
router.patch('/:id/toggle-banner', verifyToken, toggleSubcategoryBanner);
router.patch('/:id/toggle-home', verifyToken, toggleSubcategoryHome);
router.put('/:id', verifyToken, updateSubcategory);
router.delete('/:id', verifyToken, deleteSubcategory);

module.exports = router;
