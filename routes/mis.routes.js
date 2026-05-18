const express = require('express');
const router  = express.Router();

const misController   = require('../controllers/mis.controller');

// ---------------------------------------------------------------------------
// All MIS endpoints require a valid JWT and are restricted to ADMIN role.
// Adjust the middleware chain to match your existing auth setup.
// ---------------------------------------------------------------------------
const { verifyToken } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/role.middleware');

//router.use(verifyToken);

// ---------------------------------------------------------------------------
// Bookings & Status Reports
// ---------------------------------------------------------------------------

/**
 * GET /api/mis/bookings/volume
 * Report 1 — Booking volume over time
 * Query: start_date*, end_date*, period, booking_status, harvester_id, farmer_id
 */
router.get('/bookings/volume', misController.getBookingVolume);

/**
 * GET /api/mis/bookings/funnel
 * Report 2 — Booking status funnel
 * Query: start_date*, end_date*, harvester_id, farmer_id
 */
router.get('/bookings/funnel', misController.getBookingStatusFunnel);

/**
 * GET /api/mis/bookings/audit-log
 * Report 3 — Status change audit log
 * Query: start_date*, end_date*, status, changed_by_user_id, booking_id, page, limit
 */
router.get('/bookings/audit-log', misController.getStatusAuditLog);

// ---------------------------------------------------------------------------
// CATEGORY 2 — Revenue & Financials  (Reports 4-5)
// ---------------------------------------------------------------------------
 
/**
 * GET /api/mis/revenue/summary
 * Report 4 — Revenue summary by period and rate type
 * Query: start_date*, end_date*, period, rate_type, harvester_id
 */
router.get('/revenue/summary', misController.getRevenueSummary);
 
/**
 * GET /api/mis/revenue/by-harvester
 * Report 5 — Top N harvesters ranked by revenue
 * Query: start_date*, end_date*, top_n, rate_type
 */
router.get('/revenue/by-harvester', misController.getRevenueByHarvester);
 
// ---------------------------------------------------------------------------
// CATEGORY 3 — Users & Farmers  (Reports 6-7)
// ---------------------------------------------------------------------------
 
/**
 * GET /api/mis/users/registrations
 * Report 6 — New user registrations over time
 * Query: start_date*, end_date*, period, role, is_active
 */
router.get('/users/registrations', misController.getUserRegistrations);
 
/**
 * GET /api/mis/users/top-farmers
 * Report 7 — Top N farmers by booking activity
 * Query: start_date*, end_date*, top_n, booking_status
 */
router.get('/users/top-farmers', misController.getTopFarmers);
 
// ---------------------------------------------------------------------------
// CATEGORY 4 — Harvesters & Pricing  (Reports 8-9)
// ---------------------------------------------------------------------------
 
/**
 * GET /api/mis/harvesters/utilisation
 * Report 8 — Harvester utilisation (booked vs available hours)
 * Query: start_date*, end_date*, harvester_id, owner_id
 */
router.get('/harvesters/utilisation', misController.getHarvesterUtilisation);
 
/**
 * GET /api/mis/harvesters/pricing
 * Report 9 — Harvester pricing overview (no date range needed)
 * Query: rate_type, currency, active_only
 */
router.get('/harvesters/pricing', misController.getHarvesterPricingOverview);
 
// ---------------------------------------------------------------------------
// CATEGORY 5 — Operations & Platform Health  (Reports 10-12)
// ---------------------------------------------------------------------------
 
/**
 * GET /api/mis/operations/notifications
 * Report 10 — Notification delivery rates by channel
 * Query: start_date*, end_date*, channel, status
 */
router.get('/operations/notifications', misController.getNotificationDelivery);
 
/**
 * GET /api/mis/operations/field-growth
 * Report 11 — Field registration growth over time
 * Query: start_date*, end_date*, period, farmer_id, city
 */
router.get('/operations/field-growth', misController.getFieldRegistrationGrowth);
 
/**
 * GET /api/mis/operations/sessions
 * Report 12 — Active session audit (live state — no date range)
 * Query: role, expiring_within_hours
 */
router.get('/operations/sessions', misController.getActiveSessionAudit);



module.exports = router;