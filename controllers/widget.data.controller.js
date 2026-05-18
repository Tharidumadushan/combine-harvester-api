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

exports.getHarvesterOwnerStatus = async (req, res) => {
  user = req.user;
}


exports.getOwnerDashboardStats = async (req, res) => {
  try {
    const ownerId = req.userId;
    // DATE RANGES
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const monthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    );

    const monthEnd = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

    // ============================================
    // GET OWNER HARVESTERS
    // ============================================

    const harvesters = await Harvester.findAll({
      where: {
        owner_id: ownerId
      },
      attributes: ['harvester_id', 'is_active']
    });

    const harvesterIds =
      harvesters.map(h => h.harvester_id);

    // ============================================
    // TOTAL HARVESTERS
    // ============================================

    const totalHarvesters =
      harvesters.length;

    // ============================================
    // ACTIVE HARVESTERS
    // ============================================

    const activeHarvesters =
      harvesters.filter(h => h.is_active).length;

    // ============================================
    // TODAY EARNINGS
    // ============================================

    const todayBookings =
      await Booking.findAll({

        where: {

          harvester_id: {
            [Op.in]: harvesterIds
          },

          booking_status: 'COMPLETED',

          updated_at: {
            [Op.between]: [
              todayStart,
              todayEnd
            ]
          }
        },

        attributes: ['calculated_cost']
      });

    const earningsToday =
      todayBookings.reduce(
        (sum, booking) =>
          sum +
          Number(booking.calculated_cost),
        0
      );

    // ============================================
    // MONTH EARNINGS
    // ============================================

    const monthBookings =
      await Booking.findAll({

        where: {

          harvester_id: {
            [Op.in]: harvesterIds
          },

          booking_status: 'COMPLETED',

          updated_at: {
            [Op.between]: [
              monthStart,
              monthEnd
            ]
          }
        },

        attributes: [
          'calculated_cost'
        ]
      });

    const earningsMonth =
      monthBookings.reduce(
        (sum, booking) =>
          sum +
          Number(booking.calculated_cost),
        0
      );

    // ============================================
    // JOBS THIS MONTH
    // ============================================

    const jobsMonth =
      monthBookings.length;

    // ============================================
    // PENDING REQUESTS
    // ============================================

    const pendingRequests =
      await Booking.count({

        where: {

          harvester_id: {
            [Op.in]: harvesterIds
          },

          booking_status: 'REQUESTED'
        }
      });

    // ============================================
    // HARVESTERS CURRENTLY IN USE
    // ============================================

    const inUseHarvesters =
      await Booking.count({

        distinct: true,

        col: 'harvester_id',

        where: {

          harvester_id: {
            [Op.in]: harvesterIds
          },

          booking_status: {
            [Op.in]: [
              'CONFIRMED',
              'IN_PROGRESS'
            ]
          }
        }
      });

    // ============================================
    // FINAL RESPONSE
    // ============================================

    return res.status(200).json({

      success: true,

      data: {

        earningsToday,

        earningsMonth,

        jobsMonth,

        pendingRequests,

        totalHarvesters,

        activeHarvesters,

        inUseHarvesters
      }
    });

  } catch (error) {

    console.error(
      'Dashboard Stats Error:',
      error
    );

    return res.status(500).json({

      success: false,

      message:
        error.message ||
        'Failed to load dashboard stats.'
    });
  }
};


exports.getFarmerDashboard = async (req, res) => {
  try {
    const farmerId = req.userId;

    const [fields, bookings] = await Promise.all([
      // All fields belonging to this farmer
      Field.findAll({
        where:      { farmer_id: farmerId },
        attributes: ['field_id', 'calculated_area_acres'],
      }),

      // All non-terminal bookings for this farmer
      Booking.findAll({
        where: {
          farmer_id:      farmerId,
          booking_status: {
            [Op.notIn]: ['REJECTED', 'CANCELLED_BY_FARMER', 'CANCELLED_BY_OWNER', 'COMPLETED'],
          },
        },
        attributes: ['booking_id', 'booking_status'],
      }),
    ]);

    const totalAcres = fields.reduce(
      (sum, f) => sum + parseFloat(f.calculated_area_acres ?? '0'), 0
    );

    const activeBookings  = bookings.filter((b) =>
      ['CONFIRMED', 'IN_PROGRESS'].includes(b.booking_status)
    ).length;

    const pendingBookings = bookings.filter((b) =>
      b.booking_status === 'REQUESTED'
    ).length;

    return res.status(200).json({
      data: {
        totalFields:    fields.length,
        totalAcres:     parseFloat(totalAcres.toFixed(2)),
        activeBookings,
        pendingBookings,
      },
    });

  } catch (error) {
    console.error('[getFarmerDashboard]', error);
    return res.status(500).json({
      message: error.message || 'Failed to load farmer dashboard data.',
    });
  }
};