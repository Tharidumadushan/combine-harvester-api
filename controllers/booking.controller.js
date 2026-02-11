const db = require('../models');
const { Op } = require('sequelize');

const Booking = db.Booking;
const Field = db.Field;
const Harvester = db.Harvester;
const HarvesterPricing = db.HarvesterPricing;
const HarvesterAvailability = db.HarvesterAvailability;

exports.checkAvailability = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {

  } catch (error) {

  }
}

// For farmers
exports.createBooking = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const farmerId = req.userId; // From Middleware
    const { harvester_id, field_id, pricing_id, time_slot_id, calculated_cost, booking_time_range } = req.body;

    // 1. Get Field and Pricing details
    const field = await Field.findOne({
      where: { field_id: field_id, farmer_id: farmerId }
    }, { transaction: t });

    const pricing = await HarvesterPricing.findByPk(pricing_id, { transaction: t });

    if (!field) {
      return res.status(404).send({ message: 'Field not found or does not belong to you.' });
    }

    // 2. Calculate Cost based on the pricing rule 
    let calculatedCost = 0;
    if (pricing.rate_type === 'PER_AREA') {
      calculatedCost = parseFloat(field.calculated_area_acres) * parseFloat(pricing.price_per_unit);
    } else if (pricing.rate_type === 'PER_HOUR') {
      const hours = (new Date(end_time) - new Date(start_time)) / (1000 * 60 * 60);
      calculatedCost = hours * parseFloat(pricing.price_per_unit);
    }

    // 4. Create the Booking.
    // The 'no_double_bookings' EXCLUDE constraint will be checked here. 
    const booking = await Booking.create({
      farmer_id: farmerId,
      harvester_id: harvester_id,
      field_id: field_id,
      pricing_id: pricing_id,
      booking_time_range: booking_time_range,
      availability_id: time_slot_id,
      calculated_cost: calculated_cost,
      booking_status: 'REQUESTED' // Initial status 
    }, { transaction: t });

    // Disable the Slot
    const availability = await HarvesterAvailability.update({
      active: false
    },{
      where: {
        vailability_id: time_slot_id
      }
    });

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

// Give the booking for each roles. all for admimn
exports.getMyBookings = async (req, res) => {
  try {
    const userId = req.userId;
    const userRole = req.userRole; // This should be added by your auth middleware

    let bookings;
    if (userRole === 'FARMER') {
      bookings = await Booking.findAll({ 
        where: { farmer_id: userId },include:{
          
          model :Field,
          model: Harvester
        }
      });
    }

    else if (userRole === 'HARVESTER_OWNER') {
      bookings = await Booking.findAll({
        include: {
          model: Harvester,
          where: { owner_id: userId },
        }
      });
    } else {
      bookings = await Booking.findAll();  // Admins 
    }

    res.status(200).send(bookings);
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error fetching bookings.' });
  }
};

// For farmers
exports.cancelBooking = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const farmerId = req.userId;
    const { bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId, { include: Harvester });

    if (!booking) {
      return res.status(404).send({ message: 'Booking not found.' });
    }

    // 1. Update booking status
    booking.booking_status = 'CANCELLED_BY_FARMER';
    await booking.save({ transaction: t });

    // 2. Enable Availability Slot
    const availability = await HarvesterAvailability.update({
      active: true
    }, {
      where: {
        vailability_id: booking.availability_id
      }
    });

    // 2. Create status history
    await db.BookingStatusHistory.create({
      booking_id: booking.booking_id,
      status: 'CANCELLED_BY_FARMER',
      changed_by_user_id: farmerId
    }, { transaction: t });

    // 3. Create a Notification for the Farmer 
    await db.Notification.create({
      user_id: booking.farmer_id, // The farmer gets the notification
      booking_id: booking.booking_id,
      message: `Your booking Canselation for ${booking.Harvester.model_name} has been confirmed.`,
      channel: 'EMAIL'
    }, { transaction: t });

    //await t.commit();
    await t.rollback();
    res.status(200).send(booking);

  } catch (error) {
    await t.rollback();
    res.status(500).send({ message: error.message || 'Error cancelling booking.' });
  }
};


// Owners
exports.acceptBooking = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const ownerId = req.userId;
    const { bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId, { include: Harvester });

    if (!booking) {
      return res.status(404).send({ message: 'Booking not found.' });
    }
    if (booking.Harvester.owner_id !== ownerId) {
      return res.status(403).send({ message: 'Forbidden: You do not manage this booking.' });
    }
    if (booking.booking_status !== 'REQUESTED') {
      return res.status(400).send({ message: 'Booking is not in a ' + REQUESTED + ' state.' });
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

    await t.rollback();
    //await t.commit();
    res.status(200).send(booking);

  } catch (error) {
    await t.rollback();
    res.status(500).send({ message: error.message || 'Error accepting booking.' });
  }
};

exports.rejectBooking = async (req, res) => {
  
  const t = await db.sequelize.transaction();
  try {
    const ownerId = req.userId;
    const { bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId, { include: Harvester });

    if (!booking) {
      return res.status(404).send({ message: 'Booking not found.' });
    }
    if (booking.Harvester.owner_id !== ownerId) {
      return res.status(403).send({ message: 'Forbidden: You do not manage this booking.' });
    }
    if (booking.booking_status !== 'REQUESTED') {
      return res.status(400).send({ message: 'Booking is not in a ' + REQUESTED + ' state.' });
    }

    // 1. Update booking status
    booking.booking_status = 'CANCELLED_BY_OWNER';
    await booking.save({ transaction: t });

    // 2. Enable Availability Slot
    const availability = await HarvesterAvailability.update({
      active: true
    }, {
      where: {
        vailability_id: booking.availability_id
      }
    });

    // 2. Create status history
    await db.BookingStatusHistory.create({
      booking_id: booking.booking_id,
      status: 'CANCELLED_BY_OWNER',
      changed_by_user_id: ownerId
    }, { transaction: t });

    // 3. Create a Notification for the Farmer 
    await db.Notification.create({
      user_id: booking.farmer_id, // The farmer gets the notification
      booking_id: booking.booking_id,
      message: `Your booking for ${booking.Harvester.model_name} has been Rejected.`,
      channel: 'EMAIL'
    }, { transaction: t });

    await t.rollback();
    //await t.commit();
    res.status(200).send(booking);

  } catch (error) {
    await t.rollback();
    res.status(500).send({ message: error.message || 'Error accepting booking.' });
  }
};

