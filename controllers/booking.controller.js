const db = require('../models');
const { Op } = require('sequelize');

const Booking = db.Booking;
const Field = db.Field;
const Harvester = db.Harvester;
const HarvesterPricing = db.HarvesterPricing;

// POST /api/bookings || description A Farmer creates a new booking request. || access Private (Farmer only)
//#region Create
exports.createBooking = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const farmerId = req.userId; // From auth middleware
    const { harvester_id, field_id, pricing_id, start_time, end_time } = req.body;

    // 1. Get Field and Pricing details
    const field = await Field.findOne({ 
      where: { field_id: field_id, farmer_id: farmerId } 
    }, { transaction: t });
    
    const pricing = await HarvesterPricing.findByPk(pricing_id, { transaction: t });

    if (!field) {
      return res.status(404).send({ message: 'Field not found or does not belong to you.' });
    }
    if (!pricing) {
      return res.status(404).send({ message: 'Pricing model not found.' });
    }

    // 2. Calculate Cost based on the pricing rule 
    let calculated_cost = 0;
    if (pricing.rate_type === 'PER_AREA') {
      calculated_cost = parseFloat(field.calculated_area_acres) * parseFloat(pricing.price_per_unit);
    } else if (pricing.rate_type === 'PER_HOUR') {
      const hours = (new Date(end_time) - new Date(start_time)) / (1000 * 60 * 60);
      calculated_cost = hours * parseFloat(pricing.price_per_unit);
    }

    // 3. Create the booking_time_range for PostgreSQL
    const booking_time_range = [new Date(start_time), new Date(end_time)];

    // 4. Create the Booking.
    // The 'no_double_bookings' EXCLUDE constraint will be checked here. 
    const booking = await Booking.create({
      farmer_id: farmerId,
      harvester_id: harvester_id,
      field_id: field_id,
      pricing_id: pricing_id,
      booking_time_range: booking_time_range,
      calculated_cost: calculated_cost,
      booking_status: 'REQUESTED' // Initial status 
    }, { transaction: t });

    // 5. Create a Notification for the Harvester Owner 
    const harvester = await Harvester.findByPk(harvester_id, { transaction: t });
    await db.Notification.create({
      user_id: harvester.owner_id, // The owner gets the notification
      booking_id: booking.booking_id,
      message: `New booking request from farmer for field '${field.field_name}'.`,
      channel: 'EMAIL' // Or 'SMS'
    }, { transaction: t });

    // 6. Commit the transaction
    await t.commit();
    res.status(201).send(booking);

  } catch (error) {
    await t.rollback();
    
    // 7. Handle the double-booking error specifically 
    if (error.name === 'SequelizeExclusionConstraintError') {
      return res.status(409).send({ 
        message: 'Conflict: This time slot is no longer available. Please select a different time.' 
      });
    }
    
    res.status(500).send({ message: error.message || 'Error creating booking.' });
  }
};
//#endregion

// @route GET /api/bookings || description Get all bookings for the current user (context-aware). || access Private
exports.getMyBookings = async (req, res) => {
  try {
    const userId = req.userId;
    const userRole = req.userRole; // This should be added by your auth middleware

    let bookings;
    if (userRole === 'FARMER') {
      bookings = await Booking.findAll({ where: { farmer_id: userId } });
    } else if (userRole === 'HARVESTER_OWNER') {
      bookings = await Booking.findAll({
        include: {
          model: Harvester,
          where: { owner_id: userId },
          //attributes: // Don't include harvester details, just use for filter
        }
      });
    } else {
      bookings = await Booking.findAll(); //; // Admins might see all, but we'll scope to roles for now
    }

    res.status(200).send(bookings);
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error fetching bookings.' });
  }
};

// Route PUT /api/bookings/:bookingId/accept || description A Harvester Owner accepts a booking request. || access Private (Harvester Owner only)
exports.acceptBooking = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const ownerId = req.userId;
    const { bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId, { include: Harvester });

    if (!booking) {
      return res.status(404).send({ message: 'Booking not found.' });
    }
    if (booking.Harvester.owner_id!== ownerId) {
      return res.status(403).send({ message: 'Forbidden: You do not manage this booking.' });
    }
    if (booking.booking_status!== 'REQUESTED') {
      return res.status(400).send({ message: 'Booking is not in a '+REQUESTED+' state.' });
    }

    // 1. Update booking status
    booking.booking_status = 'CONFIRMED';
    await booking.save({ transaction: t });

    // 2. Create status history
    await db.BookingStatusHistory.create({
      booking_id: booking.booking_id,
      status: 'CONFIRMED',
      changed_by_user_id: ownerId
    }, { transaction: t });

    // 3. Create a Notification for the Farmer 
    await db.Notification.create({
      user_id: booking.farmer_id, // The farmer gets the notification
      booking_id: booking.booking_id,
      message: `Your booking for ${booking.Harvester.model_name} has been confirmed.`,
      channel: 'EMAIL'
    }, { transaction: t });

    await t.commit();
    res.status(200).send(booking);

  } catch (error) {
    await t.rollback();
    res.status(500).send({ message: error.message || 'Error accepting booking.' });
  }
};

/**
 * @route PUT /api/bookings/:bookingId/reject
 * @description A Harvester Owner rejects a booking request.
 * @access Private (Harvester Owner only)
 */
exports.rejectBooking = async (req, res) => {
  //... (Similar logic to acceptBooking, but set status to 'REJECTED')
  //... (Also create BookingStatusHistory and Notification)
  res.status(200).send({ message: `Owner rejects booking ${req.params.bookingId}` });
};

/**
 * @route PUT /api/bookings/:bookingId/cancel
 * @description A Farmer cancels their booking.
 * @access Private (Farmer only)
 */
exports.cancelBooking = async (req, res) => {
  //... (Logic for farmer to cancel, check ownership, set status to 'CANCELLED_BY_FARMER')
  //... (Also create BookingStatusHistory and Notification for the owner)
  res.status(200).send({ message: `Farmer cancels booking ${req.params.bookingId}` });
};