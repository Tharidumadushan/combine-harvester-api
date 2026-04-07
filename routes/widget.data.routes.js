const express = require('express');
const router = express.Router();

// --- middleware and controllers  ---
const widgetDataController = require('../controllers/widget.data.controller')
const { verifyToken } = require('../middleware/auth.middleware');

router.use(verifyToken);

router.get('/',widgetDataController.getAdminTopWidgetData );

module.exports = router;