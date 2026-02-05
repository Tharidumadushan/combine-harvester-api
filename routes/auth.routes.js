const express = require('express');
const router = express.Router();

// --- import controllers and validation middleware here ---
const authController = require('../controllers/auth.controller');
//const { validateRegistration } = require('../middleware/validate.middleware');

//----------------------------------------------------------------------------------
/**
 * @route POST /api/auth/register
 * @description Register a new user (Farmer or Harvester Owner).
 * @access Public
 */
router.post('/register', authController.register);
// router.post('/register', (req, res) => {
//   authController.register(req,res);
//   res.status(201).json({ message: 'Register endpoint' });
// });

/**-----------------------------------------------------------------------------------
 * @route POST /api/auth/login
 * @description Log in a user and return tokens.
 * @access Public
 */
router.post('/login', authController.login);

/**------------------------------------------------------------------------------------
 * @route POST /api/auth/refresh-token
 * @description Use the refresh token (from HttpOnly cookie) to get a new access token.
 * @access Public
 */
// router.post('/refresh-token', authController.refreshToken);
router.post('/refresh-token', (req, res) => {
  res.status(200).json({ message: 'Refresh token endpoint' });
});

/**
 * @route POST /api/auth/logout
 * @description Log out a user by invalidating their refresh token.
 * @access Private (Requires a valid access token to log out)
 */
// const { verifyToken } = require('../middleware/auth.middleware');
// router.post('/logout',, authController.logout);
router.post('/logout', (req, res) => {
  res.status(200).json({ message: 'Logout endpoint' });
});


module.exports = router;