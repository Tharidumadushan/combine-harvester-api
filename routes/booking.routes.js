const express = require('express');
const router = express.Router();

// --- middleware and controllers  ---
const bookingController = require('../controllers/booking.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { isFarmer, isHarvesterOwner } = require ('../middleware/role.middleware');

// Apply token verification to all routes in this file
router.use(verifyToken);

// GET /api/bookings 
// Description Get all bookings for the current user (context-aware: Farmer sees theirs, Owner sees theirs.
router.get('/', bookingController.getMyBookings);

// GET /api/bookings/:bookingId
// Get details for a single booking.
 router.get('/:bookingId', bookingController.getBookingById);


// POST /api/bookings 
// A Farmer creates a new booking request.
router.post('/', [isFarmer], bookingController.createBooking);


// PUT /api/bookings/:bookingId/cancel
// Farmer cancels their booking.
router.put('/:bookingId/cancel', [isFarmer], bookingController.cancelBooking);

//Accept
// PUT /api/bookings/:bookingId/accept 
// Harvester Owner accepts a booking request
router.put('/:bookingId/accept', [isHarvesterOwner], bookingController.acceptBooking);

//Request to Cancel
// PUT /api/bookings/:bookingId/request-cancellation 
// Farmer request to cancel the booking
router.post('/:bookingId/request-cancellation', [isFarmer], bookingController.requestCancellation);

//Accept Cancel Request
// PUT /api/bookings/:bookingId/resolve-cancellation 
// Harvester Owner accepts a booking request
router.patch('/:bookingId/resolve-cancellation', [isHarvesterOwner], bookingController.resolveCancellationRequest);

// Reject
// PUT /api/bookings/:bookingId/reject
// A Harvester Owner rejects a booking request. 
router.put('/:bookingId/reject', [isHarvesterOwner], bookingController.rejectBooking);

// In Progress
// PUT /api/bookings/:bookingId/inprogress
// A Harvester Owner rejects a booking request. 
router.put('/:bookingId/inprogress', [isHarvesterOwner], bookingController.startBooking);

//Completed
// PUT /api/bookings/:bookingId/completed
// A Harvester Owner rejects a booking request. 
router.put('/:bookingId/complete', [isFarmer], bookingController.completeBooking);


module.exports = router;