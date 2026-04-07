const express = require('express');
const router = express.Router();

// --- auth middleware and controllers ---
const userController = require('../controllers/user.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// Apply the token verification middleware to all routes in this file
router.use(verifyToken);

// Route GET /api/users/me || Description Get the profile of the currently logged-in user. || Access Private
router.get('/me/:userId', userController.getMyProfile);

// Route GET /api/users/me || Description Get the profile of the currently logged-in user. || Access Private
router.get('/me', userController.getMyProfile);


/**
 * @route PUT /api/users/me
 * @description Update the profile of the currently logged-in user.
 * @access Private
 */
router.put('/me', userController.updateMyProfile);

module.exports = router;