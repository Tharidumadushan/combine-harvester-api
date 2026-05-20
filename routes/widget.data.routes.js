const express = require('express');
const router = express.Router();

// --- middleware and controllers  ---
const widgetDataController = require('../controllers/widget.data.controller')
const { verifyToken } = require('../middleware/auth.middleware');

router.use(verifyToken);

// Top Widgets
router.get('/admindashboard',widgetDataController.getAdminTopWidgetData );

// Platform Overview % Data
router.get('/admindashboard/PlatformMetrics',widgetDataController.getPlatformMetrics );

// Last 6 Month DATA
router.get('/admindashboard/growth-trends',widgetDataController.getGrowthTrends );

router.get('/ownerdashboard',verifyToken,widgetDataController.getOwnerDashboardStats);

router.get('/farmerdashboard', verifyToken, widgetDataController.getFarmerDashboard);


module.exports = router;