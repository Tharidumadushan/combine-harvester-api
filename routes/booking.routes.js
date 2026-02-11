const express = require('express');
const router = express.Router();

// --- middleware and controllers  ---
const bookingController = require('../controllers/booking.controller');
 const { verifyToken } = require('../middleware/auth.middleware');
 const { isFarmer, isHarvesterOwner } = require('../middleware/role.middleware');

// Apply token verification to all routes in this file
router.use(verifyToken);

// Route POST /api/bookings || A Farmer creates a new booking request. || access Private (Farmer only)
router.post('/', [isFarmer], bookingController.createBooking);

// GET /api/bookings || Description Get all bookings for the current user (context-aware: Farmer sees theirs, Owner sees theirs. || access Private
router.get('/', bookingController.getMyBookings);

//[Route] GET /api/bookings/:bookingId [Description] Get details for a single booking. [Access] Private (Farmer or Owner of this booking)
// router.get('/:bookingId', bookingController.getBookingById);

// Route PUT /api/bookings/:bookingId/reject || Description A Farmer cancels their booking. || Access Private (Farmer only)
router.put('/:bookingId/cancel', [isFarmer], bookingController.cancelBooking);

//[Route] PUT /api/bookings/:bookingId/accept [Description] A Harvester Owner accepts a booking request. [Access] Private (Harvester Owner only)
router.put('/:bookingId/accept', [isHarvesterOwner], bookingController.acceptBooking);

//Route PUT /api/bookings/:bookingId/reject [Description] A Harvester Owner rejects a booking request. [Access] Private (Harvester Owner only)
router.put('/:bookingId/reject', [isHarvesterOwner], bookingController.rejectBooking);


module.exports = router;