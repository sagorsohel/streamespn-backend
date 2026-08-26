const express = require('express');
const {
  getSubcategories,
  getSubcategoryById,
  createSubcategory,
  updateSubcategory,
  toggleSubcategoryStatus,
  toggleSubcategoryTrending,
  deleteSubcategory,
  syncSubcategories,
} = require('../controllers/subcategoriesController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', getSubcategories);
router.get('/:id', getSubcategoryById);
router.post('/', verifyToken, createSubcategory);
router.post('/sync', verifyToken, syncSubcategories);
router.patch('/:id/toggle', verifyToken, toggleSubcategoryStatus);
router.patch('/:id/toggle-trending', verifyToken, toggleSubcategoryTrending);
router.put('/:id', verifyToken, updateSubcategory);
router.delete('/:id', verifyToken, deleteSubcategory);

module.exports = router;
