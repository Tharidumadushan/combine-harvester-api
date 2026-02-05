const express = require('express');
const router = express.Router();

// --- middleware and controllers  ---
const bookingController = require('../controllers/booking.controller');
 const { verifyToken } = require('../middleware/auth.middleware');
 const { isFarmer, isHarvesterOwner } = require('../middleware/role.middleware');

// Apply token verification to all routes in this file
router.use(verifyToken,isFarmer);

// Route POST /api/bookings || A Farmer creates a new booking request. || access Private (Farmer only)
router.post('/', [isFarmer], bookingController.createBooking);


/**
 * @route GET /api/bookings
 * @description Get all bookings for the current user (context-aware: Farmer sees theirs, Owner sees theirs).
 * @access Private
 */
router.get('/', bookingController.getMyBookings);
router.get('/', (req, res) => {
  res.status(200).json({ message: 'Get my bookings' });
});

/**
 * @route GET /api/bookings/:bookingId
 * @description Get details for a single booking.
 * @access Private (Farmer or Owner of this booking)
 */
// router.get('/:bookingId', bookingController.getBookingById);
router.get('/:bookingId', (req, res) => {
  res.status(200).json({ message: `Get booking ${req.params.bookingId}` });
});

/**
 * @route PUT /api/bookings/:bookingId/cancel
 * @description A Farmer cancels their booking.
 * @access Private (Farmer only)
 */
// router.put('/:bookingId/cancel', [isFarmer], bookingController.cancelBooking);
router.put('/:bookingId/cancel', (req, res) => {
  res.status(200).json({ message: `Farmer cancels booking ${req.params.bookingId}` });
});

/**
 * @route PUT /api/bookings/:bookingId/accept
 * @description A Harvester Owner accepts a booking request.
 * @access Private (Harvester Owner only)
 */
// router.put('/:bookingId/accept', [isHarvesterOwner], bookingController.acceptBooking);
router.put('/:bookingId/accept', (req, res) => {
  res.status(200).json({ message: `Owner accepts booking ${req.params.bookingId}` });
});

/**
 * @route PUT /api/bookings/:bookingId/reject
 * @description A Harvester Owner rejects a booking request.
 * @access Private (Harvester Owner only)
 */
// router.put('/:bookingId/reject', [isHarvesterOwner], bookingController.rejectBooking);
router.put('/:bookingId/reject', (req, res) => {
  res.status(200).json({ message: `Owner rejects booking ${req.params.bookingId}` });
});

module.exports = router;