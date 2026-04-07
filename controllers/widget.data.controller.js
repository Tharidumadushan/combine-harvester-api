const db = require('../models');
const Booking = db.Booking;
const Field = db.Field;
const Harvester = db.Harvester;
const HarvesterPricing = db.HarvesterPricing;
const HarvesterAvailability = db.HarvesterAvailability;
const UserProfile = db.UserProfile;
const User = db.User;
const { Op } = require('sequelize');
const Notification = db.Notification;

exports.getAdminTopWidgetData = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Run all counts in parallel for better performance
    const [
      activeFarmers,
      totalFields,
      bookingsToday,
      activeOwners,
      totalHarvesters,
      cancellations,
      rejections,
      inProgress
    ] = await Promise.all([
      // 1. Active Farmers (Assuming 'role' is in User and 'is_active' exists)
      User.count({ where: { role: 'FARMER', is_active: true } }),

      // 2. Total Fields
      Field.count(),

      // 3. Bookings for Today
      Booking.count({
        where: {
          created_at: {
            [Op.gte]: todayStart,
            [Op.lte]: todayEnd
          }
        }
      }),

      // 4. Active Harvester Owners
      User.count({ where: { role: 'HARVESTER_OWNER', is_active: true } }),

      // 5. Total Harvesters
      Harvester.count(),

      // 6. Cancellations (Assuming status column exists)
      Booking.count({ where: { booking_status: "CANCELLED_BY_FARMER" } }),

      // 7. Rejections
      Booking.count({ where: { booking_status: "REJECTED" } }),

      Booking.count({where:{booking_status:"IN_PROGRESS"}})
    ]);

    // Format the response to match your widget requirements
    const stats = {
      farmers: { label: 'Active Farmers', value: activeFarmers.toLocaleString() },
      fields: { label: 'Total Fields', value: totalFields.toLocaleString() },
      todayBookings: { label: 'Bookings for Today', value: bookingsToday.toLocaleString() },
      owners: { label: 'Active Harvester Owners', value: activeOwners.toLocaleString() },
      harvesters: { label: 'Total Harvesters', value: totalHarvesters.toLocaleString() },
      cancellations: { label: 'Cancelations', value: cancellations.toLocaleString() },
      rejections: { label: 'Rejections', value: rejections.toLocaleString() },
      disputes: { label: 'In Progress', value: inProgress.toLocaleString() } 
    };

    res.status(200).send(stats);
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error fetching dashboard stats.' });
  }
};