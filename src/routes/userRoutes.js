const express = require('express');
const { getAllUsers, getUserById } = require('../controllers/userController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', verifyToken, getAllUsers);
router.get('/:id', verifyToken, getUserById);

module.exports = router;
