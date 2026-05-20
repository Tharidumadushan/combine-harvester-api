const express = require('express');
const router = express.Router();

// --- middleware and controllers ---
const { verifyToken } = require('../middleware/auth.middleware');
const { isFarmer } = require('../middleware/role.middleware');
const misController = require('../controllers/report.controller');

// Apply the token verification middleware to all routes in this file
//router.use(verifyToken);

router.get('/booking-summary', misController.getBookingSummary);
router.get('/booking-trends', misController.getBookingTrends);
router.get('/booking-lifecycle', misController.getBookingLifecycle);
router.get('/revenue', misController.getRevenueReport);
router.get('/revenue-trends', misController.getRevenueTrends);

router.get('/harvester-utilization', misController.getHarvesterUtilization);
router.get('/harvester-performance', misController.getHarvesterPerformance);
router.get('/farmer-activity', misController.getFarmerActivity);
router.get('/field-utilization', misController.getFieldUtilization);
router.get('/time-demand', misController.getTimeBasedDemand);

router.get('/pricing-analysis', misController.getPricingAnalysis);
router.get('/cancellations', misController.getCancellationReport);
router.get('/idle-harvesters', misController.getIdleHarvesters);
router.get('/availability-vs-bookings', misController.getAvailabilityVsBookings);
router.get('/geographic', misController.getGeographicReport);
router.get('/notifications', misController.getNotificationReport);
router.get('/user-registration-trend', misController.getUserRegistrationTrend);
router.get('/user-activity', misController.getUserActivityStatus);
router.get('/top-customers', misController.getTopCustomers);
router.get('/dashboard-summary', misController.getDashboardSummary);

module.exports = router;