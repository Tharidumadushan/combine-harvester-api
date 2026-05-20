const express = require('express');
const router = express.Router();

// --- middleware and controllers  ---
const notificationController = require('../controllers/notification.controller')
const { verifyToken } = require('../middleware/auth.middleware');

router.use(verifyToken);

router.get('/',notificationController.getMyNotifications );

module.exports = router;