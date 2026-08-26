const { eq } = require('drizzle-orm');
const { db } = require('../db');
const { users } = require('../db/schema');

// Get all users (admin or authenticated)
const getAllUsers = async (req, res, next) => {
  try {
    const userList = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users);

    return res.status(200).json({
      success: true,
      count: userList.length,
      data: {
        users: userList,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get single user by ID
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const foundUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, Number(id)))
      .limit(1);

    if (foundUsers.length === 0) {
      return res.status(404).json({
        success: false,
        message: `User with ID ${id} not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        user: foundUsers[0],
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
};
