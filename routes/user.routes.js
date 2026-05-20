const express = require('express');
const router = express.Router();

// --- auth middleware and controllers ---
const userController = require('../controllers/user.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// Apply the token verification middleware to all routes in this file
router.use(verifyToken);

// Route GET /api/users/me || Get the profile by id
router.get('/me/:userId', userController.getMyProfile);

// Route GET /api/users/me || Get the profile of the currently logged-in user. || Access Private
router.get('/me', userController.getMyProfile);

// PUT /api/users/me ||  Update the profile of the currently logged-in user.
router.put('/me', userController.updateMyProfile);

//-------------------------------------ADMIN Ends--------------------------------------------------
// Route GET /api/users/all || Get user list for Admin User Management
router.get('/all',userController.getAllUsers);

// PUT /api/users/:userId/admin || Save user data by ADMIN
router.put('/:userId/admin', userController.adminUpdateUser);

// || Changed Active state by ADMIN
router.patch('/:userId/status', userController.toggleUserStatus);

// || Get User data and User profile by ID
router.get('/:userId', userController.getUserById);

module.exports = router;