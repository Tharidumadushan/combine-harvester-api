const db = require('../models');
const { Op } = require('sequelize');

const Booking = db.Booking;
const Field = db.Field;
const Harvester = db.Harvester;
const HarvesterPricing = db.HarvesterPricing;
const HarvesterAvailability = db.HarvesterAvailability;
const UserProfile = db.UserProfile;
const User = db.User;

const IsTesting = false;

// ----------------------GET---------------------------------------------------------------
// Give the booking for each roles. all for admimn
exports.getMyBookings = async (req, res) => {
  try {
    const userId = req.userId;
    const userRole = req.userRole;

    let bookings;

    if (userRole === 'FARMER') {
      bookings = await Booking.findAll({
        where: { farmer_id: userId },
        // array [] to include multiple models
        include: [
          { model: Field },
          { model: Harvester }
        ]
      });
    }
    else if (userRole === 'HARVESTER_OWNER') {
      bookings = await Booking.findAll({
        include: [
          {
            model: Harvester,
            where: { owner_id: userId },
            required: true // Ensures only bookings with the owner's harvester are returned
          },
          { model: Field }
        ]
      });
    }
    else {
      // Admins usually want to see everything
      bookings = await Booking.findAll({
        include: [{ model: Field }, { model: Harvester }]
      });
    }

    res.status(200).send(bookings);
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error fetching bookings.' });
  }
};

exports.getBookingById = async (req, res) => {
  try {
    const bookingId = req.params.bookingId
    let bookings;

    bookings = await Booking.findAll({
      where: { booking_id: bookingId },
      include: [
        { model: Field },
        { model: Harvester }
      ]
    });

    res.status(200).send(bookings);

  } catch (error) {
    res.status(500).send({ message: error.message || 'Error fetching bookings.' });
  }
};

// ----------------------POST--------------------------------------------------------------
// For farmers
exports.createBooking = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const farmerId = req.userId; // From Middleware
    const { harvester_id, field_id, pricing_id, time_slot_id, calculated_cost, booking_time_range } = req.body;

    // Get Field and Pricing details
    const field = await Field.findOne({
      where: { field_id: field_id, farmer_id: farmerId }
    }, { transaction: t });

    const pricing = await HarvesterPricing.findByPk(pricing_id, { transaction: t });

    if (!field) {
      return res.status(404).send({ message: 'Field not found or does not belong to you.' });
    }

    // Calculate Cost based on the pricing rule 
    // let calculatedCost = 0;
    // if (pricing.rate_type === 'PER_AREA') {
    //   calculatedCost = parseFloat(field.calculated_area_acres) * parseFloat(pricing.price_per_unit);
    // } else if (pricing.rate_type === 'PER_HOUR') {
    //   const hours = (new Date(end_time) - new Date(start_time)) / (1000 * 60 * 60);
    //   calculatedCost = hours * parseFloat(pricing.price_per_unit);
    // }

    // Create the Booking.
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
    }, {
      where: {
        availability_id: time_slot_id
      }
    });

    // Create status history
    await db.BookingStatusHistory.create({
      booking_id: booking.booking_id,
      status: 'REQUESTED',
      changed_by_user_id: farmerId
    }, { transaction: t });

    // Create a Notification for the Harvester Owner 
    const harvester = await Harvester.findByPk(harvester_id, { transaction: t });
    await db.Notification.create({
      user_id: harvester.owner_id, // The owner gets the notification
      booking_id: booking.booking_id,
      message: `New booking request from farmer for field '${field.field_name}'.`,
      channel: 'EMAIL' // Or 'SMS'
    }, { transaction: t });

    if(IsTesting){
      await t.rollback();
    }else{
      await t.commit();
    }
    res.status(201).send(booking);

  } catch (error) {
    await t.rollback();

    if (error.name === 'SequelizeExclusionConstraintError') {
      return res.status(409).send({
        message: 'Conflict: This time slot is no longer available. Please select a different time.'
      });
    }
    res.status(500).send({ message: error.message || 'Error creating booking.' });
  }
};

// ---------------------UPDATE-------------------------------------------------------------

// ___________________Owner_____________________
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

    if(IsTesting){
      await t.rollback();
    }else{
      await t.commit();
    }
    
    res.status(200).send(booking);

  } catch (error) {
    await t.rollback();
    res.status(500).send({ message: error.message || 'Error accepting booking.' });
  }
};

exports.resolveCancellationRequest = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const userId = req.userId;
    const { bookingId } = req.params;
    const { action, reason } = req.body; // action: 'APPROVE' or 'REJECT'

    // Validate action value ───────────────────────────────────────────
    if (!['APPROVE', 'REJECT'].includes(action)) {
      await t.rollback();
      return res.status(400).send({
        message: "Action must be either 'APPROVE' or 'REJECT'.",
      });
    }

    // Fetch the booking with harvester included ───────────────────────
    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: Harvester }],
      transaction: t,
    });

    if (!booking) {
      await t.rollback();
      return res.status(404).send({ message: 'Booking not found.' });
    }

    // Fetch the requesting user ───────────────────────────────────────
    const user = await db.User.findByPk(userId, { transaction: t });

    if (!user) {
      await t.rollback();
      return res.status(404).send({ message: 'User not found.' });
    }

    // Only the owner of the harvester can resolve the cancellation ────
    const isOwner = user.role === 'HARVESTER_OWNER' && booking.Harvester.owner_id === userId;

    if (!isOwner) {
      await t.rollback();
      return res.status(403).send({
        message: 'Forbidden: Only the harvester owner can resolve a cancellation request.',
      });
    }

    // Booking must be in CANCELLATION_REQUESTED state ─────────────────
    if (booking.booking_status !== 'CANCELLATION_REQUESTED') {
      await t.rollback();
      return res.status(400).send({
        message: `No pending cancellation request for this booking. Current status: '${booking.booking_status}'.`,
      });
    }

    // Determine new status based on owner's decision ──────────────────
    let newStatus;
    let notifyMessage;

    if (action === 'APPROVE') {
      newStatus = 'CANCELLATION_APPROVED';
      notifyMessage = `Your cancellation request for ${booking.Harvester.model_name} has been approved by the owner (Ref: #${bookingId.slice(-6).toUpperCase()}).${reason ? ` Reason: ${reason}` : ''}`;
    } else {
      newStatus = 'CONFIRMED'; // revert back to confirmed
      notifyMessage = `Your cancellation request for ${booking.Harvester.model_name} has been rejected by the owner (Ref: #${bookingId.slice(-6).toUpperCase()}).${reason ? ` Reason: ${reason}` : ''}`;
    }

    // Update booking status ───────────────────────────────────────────
    booking.booking_status = newStatus;
    await booking.save({ transaction: t });

    // Re-enable the availability slot only if cancellation approved ───
    if (action === 'APPROVE' && booking.availability_id) {
      await HarvesterAvailability.update(
        { active: true },
        {
          where: { availability_id: booking.availability_id },
          transaction: t,
        }
      );
    }

    // Create status history entry ─────────────────────────────────────
    // Note: changed_by_user_id is the OWNER, but status name makes clear
    // this was a farmer-initiated cancellation that the owner resolved.
    await db.BookingStatusHistory.create({
      booking_id: booking.booking_id,
      status: newStatus,
      changed_by_user_id: userId,
      notes: reason || null,
    }, { transaction: t });

    // Notify the farmer of the owner's decision ───────────────────────
    await db.Notification.create({
      user_id: booking.farmer_id,
      booking_id: booking.booking_id,
      message: notifyMessage,
      channel: 'EMAIL',
    }, { transaction: t });

    if(IsTesting){
      await t.rollback();
    }else{
      await t.commit();
    }
    return res.status(200).send(booking);

  } catch (error) {
    await t.rollback();
    console.error('[resolveCancellationRequest]', error);
    return res.status(500).send({
      message: error.message || 'Error resolving cancellation request.',
    });
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
      status: 'REJECTED',
      changed_by_user_id: ownerId
    }, { transaction: t });

    // 3. Create a Notification for the Farmer 
    await db.Notification.create({
      user_id: booking.farmer_id, // The farmer gets the notification
      booking_id: booking.booking_id,
      message: `Your booking for ${booking.Harvester.model_name} has been Rejected.`,
      channel: 'EMAIL'
    }, { transaction: t });

    if(IsTesting){
      await t.rollback();
    }else{
      await t.commit();
    }
    res.status(200).send(booking);

  } catch (error) {
    await t.rollback();
    res.status(500).send({ message: error.message || 'Error accepting booking.' });
  }
};

exports.startBooking = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const ownerId = req.userId;
    const { bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId, { include: Harvester });

    if (!booking) {
      await t.rollback();
      return res.status(404).send({ message: 'Booking not found.' });
    }

    // Only the harvester owner can mark a job as started
    if (booking.Harvester.owner_id !== ownerId) {
      await t.rollback();
      return res.status(403).send({
        message: 'Forbidden: You do not manage this booking.',
      });
    }

    if (booking.booking_status !== 'CONFIRMED') {
      await t.rollback();
      return res.status(400).send({
        message: `Booking must be in CONFIRMED state to start. Current state: ${booking.booking_status}.`,
      });
    }

    // 1. Update booking status
    booking.booking_status = 'IN_PROGRESS';
    await booking.save({ transaction: t });

    // 2. Create status history entry
    await db.BookingStatusHistory.create({
      booking_id: booking.booking_id,
      status: 'IN_PROGRESS',
      changed_by_user_id: ownerId,
    }, { transaction: t });

    // 3. Notify the farmer that harvesting has started
    await db.Notification.create({
      user_id: booking.farmer_id,
      booking_id: booking.booking_id,
      message: `Harvesting has started on your booking for ${booking.Harvester.model_name}. The machine is now working on your field.`,
      channel: 'EMAIL',
    }, { transaction: t });

    if(IsTesting){
      await t.rollback();
    }else{
      await t.commit();
    }
    return res.status(200).send(booking);

  } catch (error) {
    await t.rollback();
    console.error('[startBooking]', error);
    return res.status(500).send({
      message: error.message || 'Error starting booking.',
    });
  }
};

// ___________________Farmer_____________________
exports.requestCancellation = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const userId = req.userId;
    const { bookingId } = req.params;
    const { reason } = req.body;

    // Fetch the booking with harvester included ───────────────────────
    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: Harvester }],
      transaction: t,
    });

    if (!booking) {
      await t.rollback();
      return res.status(404).send({ message: 'Booking not found.' });
    }

    // Fetch the requesting user ───────────────────────────────────────
    const user = await db.User.findByPk(userId, { transaction: t });

    if (!user) {
      await t.rollback();
      return res.status(404).send({ message: 'User not found.' });
    }

    // Only the farmer who made the booking can request cancellation ───
    const isFarmer = user.role === 'FARMER' && booking.farmer_id === userId;

    if (!isFarmer) {
      await t.rollback();
      return res.status(403).send({
        message: 'Forbidden: Only the farmer who made this booking can request a cancellation.',
      });
    }

    // Only CONFIRMED bookings can have a cancellation requested ───────
    if (booking.booking_status !== 'CONFIRMED') {
      await t.rollback();
      return res.status(400).send({
        message: `Cannot request cancellation for a booking in '${booking.booking_status}' state. Only CONFIRMED bookings can be requested for cancellation.`,
      });
    }

    // Check minimum cancellation hours ────────────────────────────────
    const minHours = parseInt(process.env.MIN_CANCELLATION_HOURS) || 24;

    // Safely extract start time from Sequelize RANGE type
    const rangeStart = booking.booking_time_range?.[0]?.value;
    if (!rangeStart) {
      await t.rollback();
      return res.status(400).send({ message: 'Booking start time is missing.' });
    }
    const bookingStart = new Date(rangeStart);
    const now = new Date();
    const hoursUntilStart = (bookingStart.getTime() - now.getTime()) / (1000 * 60 * 60);


    if (hoursUntilStart < minHours) {
      await t.rollback();
      return res.status(400).send({
        message: `Cancellation must be requested at least ${minHours} hours before the booking start time. Your booking starts in ${Math.round(hoursUntilStart)} hour(s).`,
      });
    }

    // Update booking status ───────────────────────────────────────────
    booking.booking_status = 'CANCELLATION_REQUESTED';
    await booking.save({ transaction: t });

    // Create status history entry ─────────────────────────────────────
    await db.BookingStatusHistory.create({
      booking_id: booking.booking_id,
      status: 'CANCELLATION_REQUESTED',
      changed_by_user_id: userId,
      notes: reason || null,
    }, { transaction: t });

    // Notify the owner ────────────────────────────────────────────────
    await db.Notification.create({
      user_id: booking.Harvester.owner_id,
      booking_id: booking.booking_id,
      message: `Farmer has requested a cancellation for ${booking.Harvester.model_name} (Ref: #${bookingId.slice(-6).toUpperCase()}).${reason ? ` Reason: ${reason}` : ''}`,
      channel: 'EMAIL',
    }, { transaction: t });

    if(IsTesting){
      await t.rollback();
    }else{
      await t.commit();
    }
    return res.status(200).send(booking);

  } catch (error) {
    await t.rollback();
    console.error('[requestCancellation]', error);
    return res.status(500).send({
      message: error.message || 'Error requesting cancellation.',
    });
  }
};

exports.completeBooking = async (req, res) => {
  // Booking must be IN_PROGRESS before it can be marked COMPLETED.
  // Also increments the harvester's completed_jobs counter.
  const t = await db.sequelize.transaction();
  try {
    const farmerId = req.userId;
    const { bookingId } = req.params;

    // Include Harvester to update completed_jobs and send a notification
    const booking = await Booking.findByPk(bookingId, { include: Harvester });

    if (!booking) {
      await t.rollback();
      return res.status(404).send({ message: 'Booking not found.' });
    }

    // Only the farmer who created the booking can mark it as complete
    if (booking.farmer_id !== farmerId) {
      await t.rollback();
      return res.status(403).send({
        message: 'Forbidden: Only the farmer who made this booking can mark it as complete.',
      });
    }

    if (booking.booking_status !== 'IN_PROGRESS') {
      await t.rollback();
      return res.status(400).send({
        message: `Booking must be IN_PROGRESS to complete. Current state: ${booking.booking_status}.`,
      });
    }

    // Update booking status
    booking.booking_status = 'COMPLETED';
    await booking.save({ transaction: t });

    // Increment the harvester's completed jobs counter
    // This feeds into the trust/ratings display on the listing page.
    await Harvester.increment('completed_jobs', {
      by: 1,
      where: { harvester_id: booking.harvester_id },
      transaction: t,
    });

    // Re-enable the availability slot so the owner can accept
    // future bookings for that same time window if needed.
    // Uses a try/catch internally so a missing slot doesn't kill the whole transaction.
    // if (booking.availability_id) {
    //   await HarvesterAvailability.update(
    //     { active: true },
    //     {
    //       where:       { availability_id: booking.availability_id },
    //       transaction: t,
    //     }
    //   );
    // }

    // Create status history entry
    await db.BookingStatusHistory.create({
      booking_id: booking.booking_id,
      status: 'COMPLETED',
      changed_by_user_id: farmerId,
    }, { transaction: t });

    // 5. Notify the harvester owner that the farmer confirmed completion
    await db.Notification.create({
      user_id: booking.Harvester.owner_id,
      booking_id: booking.booking_id,
      message: `The farmer has confirmed that the harvest is complete for booking #${booking.booking_id.slice(-6).toUpperCase()}. Your completed jobs count has been updated.`,
      channel: 'EMAIL',
    }, { transaction: t });

    if(IsTesting){
      await t.rollback();
    }else{
      await t.commit();
    }
    return res.status(200).send(booking);

  } catch (error) {
    await t.rollback();
    console.error('[completeBooking]', error);
    return res.status(500).send({
      message: error.message || 'Error completing booking.',
    });
  }
};


// ___________________Both________________________
exports.cancelBooking = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const userId = req.userId;
    const { bookingId } = req.params;
    const { reason } = req.body;

    // Fetch the booking with harvester included ───────────────────────
    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: Harvester }],
      transaction: t,
    });

    if (!booking) {
      await t.rollback();
      return res.status(404).send({ message: 'Booking not found.' });
    }

    // Fetch the requesting user to determine their role ──────────────
    const user = await db.User.findByPk(userId, { transaction: t });

    if (!user) {
      await t.rollback();
      return res.status(404).send({ message: 'User not found.' });
    }

    // Determine cancellation status and authorisation ─────────────────
    // Only the farmer who made the booking OR the owner of the harvester
    // can cancel. Any other user (including SYSTEM_ADMIN) is blocked here
    // since they have a separate admin override route.
    let newStatus;
    let notifyUserId;    // who receives the notification
    let notifyMessage;

    const isFarmer = user.role === 'FARMER' && booking.farmer_id === userId;
    const isOwner = user.role === 'HARVESTER_OWNER' && booking.Harvester.owner_id === userId;
    const cancellableStatuses = [];

    if (isFarmer) {
      newStatus = 'CANCELLED_BY_FARMER';
      notifyUserId = booking.Harvester.owner_id; // notify the owner
      notifyMessage = `Farmer has cancelled the booking for ${booking.Harvester.model_name} (Ref: #${bookingId.slice(-6).toUpperCase()}).${reason ? ` Reason: ${reason}` : ''}`;
      cancellableStatuses.push('REQUESTED');

    } else if (isOwner) {
      newStatus = 'CANCELLED_BY_OWNER';
      notifyUserId = booking.farmer_id; // notify the farmer
      notifyMessage = `Your booking for ${booking.Harvester.model_name} has been cancelled by the owner (Ref: #${bookingId.slice(-6).toUpperCase()}).${reason ? ` Reason: ${reason}` : ''}`;
      const cancellableStatuses = ['REQUESTED', 'CONFIRMED'];

    } else {
      await t.rollback();
      return res.status(403).send({
        message: 'Forbidden: You are not authorised to cancel this booking.',
      });
    }

    // Validate the booking is in a cancellable state ──────────────────
    // Farmers can cancel REQUESTED bookings.
    // Owners can cancel REQUESTED or CONFIRMED bookings.
    // Neither can cancel a job that is already IN_PROGRESS or terminal.

    if (!cancellableStatuses.includes(booking.booking_status)) {
      await t.rollback();
      return res.status(400).send({
        message: `Cannot cancel a booking in '${booking.booking_status}' state. Only ${cancellableStatuses.join(' or ')} bookings can be cancelled.`,
      });
    }

    // Update booking status ───────────────────────────────────────────
    booking.booking_status = newStatus;
    await booking.save({ transaction: t });

    // Re-enable the availability slot 
    if (booking.availability_id) {
      await HarvesterAvailability.update(
        { active: true },
        {
          where: { availability_id: booking.availability_id },
          transaction: t,
        }
      );
    }

    // Create status history entry ────────────────────────────────────
    await db.BookingStatusHistory.create({
      booking_id: booking.booking_id,
      status: newStatus,
      changed_by_user_id: userId,
      notes: reason || null,
    }, { transaction: t });

    // ── 8. Notify the other party ──────────────────────────────────────────
    await db.Notification.create({
      user_id: notifyUserId,
      booking_id: booking.booking_id,
      message: notifyMessage,
      channel: 'EMAIL',
    }, { transaction: t });

    if(IsTesting){
      await t.rollback();
    }else{
      await t.commit();
    }
    return res.status(200).send(booking);

  } catch (error) {
    await t.rollback();
    console.error('[cancelBooking]', error);
    return res.status(500).send({
      message: error.message || 'Error cancelling booking.',
    });
  }
};