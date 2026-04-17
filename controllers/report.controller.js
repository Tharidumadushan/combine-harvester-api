const db = require('../models');
const { Op, fn, col, literal } = require('sequelize');

const Booking = db.Booking;
const Harvester = db.Harvester;
const User = db.User;
const Field = db.Field;
const Notification = db.Notification;
const HarvesterAvailability = db.HarvesterAvailability;
const Farmer = db.Farmer;

/**
 * Utility: Get date filter from query
 * Supports: ?startDate=2025-01-01&endDate=2025-01-31
 */
const getDateFilter = (query) => {
    const { startDate, endDate } = query;

    if (startDate && endDate) {
        return {
            created_at: {
                [Op.between]: [new Date(startDate), new Date(endDate)]
            }
        };
    }

    return {};
};


// ============================================================
// 1. BOOKING SUMMARY REPORT
// ============================================================
// Returns total bookings grouped by status
exports.getBookingSummary = async (req, res) => {
    try {
        const dateFilter = getDateFilter(req.query);

        const summary = await Booking.findAll({
            attributes: [
                'booking_status',
                [fn('COUNT', col('booking_id')), 'total']
            ],
            where: dateFilter,
            group: ['booking_status']
        });

        res.status(200).send(summary);
    } catch (error) {
        res.status(500).send({
            message: error.message || 'Error fetching booking summary report'
        });
    }
};


// ============================================================
// 2. BOOKING TREND REPORT
// ============================================================
// Returns number of bookings per day
exports.getBookingTrends = async (req, res) => {
    try {
        const dateFilter = getDateFilter(req.query);

        const trends = await Booking.findAll({
            attributes: [
                [fn('DATE', col('created_at')), 'date'],
                [fn('COUNT', col('booking_id')), 'total_bookings']
            ],
            where: dateFilter,
            group: [fn('DATE', col('created_at'))],
            order: [[fn('DATE', col('created_at')), 'ASC']]
        });

        res.status(200).send(trends);
    } catch (error) {
        res.status(500).send({
            message: error.message || 'Error fetching booking trends'
        });
    }
};


// ============================================================
// 3. BOOKING STATUS LIFECYCLE REPORT
// ============================================================
// Shows how many bookings passed through each status (from history)
exports.getBookingLifecycle = async (req, res) => {
    try {
        const lifecycle = await db.BookingStatusHistory.findAll({
            attributes: [
                'status',
                [fn('COUNT', col('history_id')), 'count']
            ],
            group: ['status']
        });

        res.status(200).send(lifecycle);
    } catch (error) {
        res.status(500).send({
            message: error.message || 'Error fetching lifecycle report'
        });
    }
};


// ============================================================
// 4. REVENUE REPORT
// ============================================================
// Calculates total revenue from completed bookings
exports.getRevenueReport = async (req, res) => {
    try {
        const dateFilter = getDateFilter(req.query);

        const revenue = await Booking.findAll({
            attributes: [
                [fn('SUM', col('calculated_cost')), 'total_revenue']
            ],
            where: {
                ...dateFilter,
                booking_status: 'COMPLETED'
            }
        });

        res.status(200).send(revenue[0]); // return single object
    } catch (error) {
        res.status(500).send({
            message: error.message || 'Error fetching revenue report'
        });
    }
};


// ============================================================
// 5. REVENUE TREND REPORT
// ============================================================
// Shows revenue per day (only completed bookings)
exports.getRevenueTrends = async (req, res) => {
    try {
        const dateFilter = getDateFilter(req.query);

        const revenueTrends = await Booking.findAll({
            attributes: [
                [fn('DATE', col('created_at')), 'date'],
                [fn('SUM', col('calculated_cost')), 'daily_revenue']
            ],
            where: {
                ...dateFilter,
                booking_status: 'COMPLETED'
            },
            group: [fn('DATE', col('created_at'))],
            order: [[fn('DATE', col('created_at')), 'ASC']]
        });

        res.status(200).send(revenueTrends);
    } catch (error) {
        res.status(500).send({
            message: error.message || 'Error fetching revenue trends'
        });
    }
};


// ============================================================
// 6. HARVESTER UTILIZATION REPORT
// ============================================================
// Measures how much each harvester is used based on booking count
// (Simplified version: count of bookings per harvester)
// Advanced version can include time-based utilization

exports.getHarvesterUtilization = async (req, res) => {
    try {
        const utilization = await Booking.findAll({
            attributes: [
                'harvester_id',
                [fn('COUNT', col('booking_id')), 'total_bookings']
            ],
            include: [
                {
                    model: Harvester,
                    attributes: ['model_name']
                }
            ],
            group: ['Booking.harvester_id', 'Harvester.harvester_id'],
            order: [[fn('COUNT', col('booking_id')), 'DESC']]
        });

        res.status(200).send(utilization);
    } catch (error) {
        res.status(500).send({
            message: error.message || 'Error fetching harvester utilization report'
        });
    }
};


// ============================================================
// 7. HARVESTER PERFORMANCE REPORT
// ============================================================
// Shows both booking count and total revenue per harvester

exports.getHarvesterPerformance = async (req, res) => {
    try {
        const performance = await Booking.findAll({
            attributes: [
                'harvester_id',
                [fn('COUNT', col('booking_id')), 'total_bookings'],
                [fn('SUM', col('calculated_cost')), 'total_revenue']
            ],
            include: [
                {
                    model: Harvester,
                    attributes: ['model_name']
                }
            ],
            where: {
                booking_status: 'COMPLETED'
            },
            group: ['Booking.harvester_id', 'Harvester.harvester_id'],
            order: [[literal('total_revenue'), 'DESC']]
        });

        res.status(200).send(performance);
    } catch (error) {
        res.status(500).send({
            message: error.message || 'Error fetching harvester performance report'
        });
    }
};


// ============================================================
// 8. FARMER ACTIVITY REPORT
// ============================================================
// Shows how active each farmer is (bookings + spending)

exports.getFarmerActivity = async (req, res) => {
    try {
        const activity = await Booking.findAll({
            attributes: [
                'farmer_id',
                [fn('COUNT', col('booking_id')), 'total_bookings'],
                [fn('SUM', col('calculated_cost')), 'total_spent']
            ],
            //   include: [
            //     {
            //       attributes: ['email']
            //     }
            //   ],
            group: ['farmer_id'],
            order: [[literal('total_spent'), 'DESC']]
        });

        res.status(200).send(activity);
    } catch (error) {
        res.status(500).send({
            message: error.message || 'Error fetching farmer activity report'
        });
    }
};


// ============================================================
// 9. FIELD UTILIZATION REPORT
// ============================================================
// Compares field size vs booking usage

exports.getFieldUtilization = async (req, res) => {
    try {
        const fieldUtilization = await Booking.findAll({
            attributes: [
                'field_id',
                [fn('COUNT', col('booking_id')), 'total_bookings'],
                [fn('SUM', col('calculated_cost')), 'total_revenue']
            ],
            include: [
                {
                    model: Field,
                    attributes: ['field_name', 'calculated_area_acres']
                }
            ],
            group: ['Booking.field_id', 'Field.field_id'],
            order: [[literal('total_bookings'), 'DESC']]
        });

        res.status(200).send(fieldUtilization);
    } catch (error) {
        res.status(500).send({
            message: error.message || 'Error fetching field utilization report'
        });
    }
};


// ============================================================
// 10. TIME-BASED DEMAND REPORT
// ============================================================
// Shows booking distribution by hour of the day

exports.getTimeBasedDemand = async (req, res) => {
    try {
        const demand = await Booking.findAll({
            attributes: [
                // Extract hour from booking start time
                [fn('EXTRACT', literal('HOUR FROM lower("booking_time_range")')), 'hour'],
                [fn('COUNT', col('booking_id')), 'total_bookings']
            ],
            group: [literal('hour')],
            order: [[literal('hour'), 'ASC']]
        });

        res.status(200).send(demand);
    } catch (error) {
        res.status(500).send({
            message: error.message || 'Error fetching time-based demand report'
        });
    }
};

// ============================================================
// 11. PRICING ANALYSIS REPORT
// ============================================================
// Shows revenue grouped by pricing type (PER_AREA / PER_HOUR)

exports.getPricingAnalysis = async (req, res) => {
    try {
        const result = await Booking.findAll({
            attributes: [
                [col('HarvesterPricing.rate_type'), 'rate_type'],
                [fn('COUNT', col('booking_id')), 'total_bookings'],
                [fn('SUM', col('calculated_cost')), 'total_revenue']
            ],
            include: [{
                model: db.HarvesterPricing,
                attributes: []
            }],
            group: ['HarvesterPricing.rate_type']
        });

        res.status(200).send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};



// ============================================================
// 12. CANCELLATION REPORT
// ============================================================
// Shows cancellation distribution

exports.getCancellationReport = async (req, res) => {
    try {
        const result = await Booking.findAll({
            attributes: [
                'booking_status',
                [fn('COUNT', col('booking_id')), 'total']
            ],
            where: {
                booking_status: {
                    [Op.in]: ['CANCELLED_BY_FARMER', 'CANCELLED_BY_OWNER']
                }
            },
            group: ['booking_status']
        });

        res.status(200).send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};



// ============================================================
// 13. IDLE HARVESTER REPORT
// ============================================================
// Harvesters with low or zero bookings

exports.getIdleHarvesters = async (req, res) => {
    try {
        const result = await Harvester.findAll({
            attributes: [
                'harvester_id',
                'model_name',
                [fn('COUNT', col('Bookings.booking_id')), 'total_bookings']
            ],
            include: [{
                model: Booking,
                attributes: [],
                required: false
            }],
            group: ['Harvester.harvester_id'],
            order: [[literal('total_bookings'), 'ASC']]
        });

        res.status(200).send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};



// ============================================================
// 14. AVAILABILITY VS BOOKINGS REPORT
// ============================================================
// Compare available slots vs bookings

exports.getAvailabilityVsBookings = async (req, res) => {
    try {
        const totalAvailability = await HarvesterAvailability.count();
        const totalBookings = await Booking.count();

        res.status(200).send({
            total_availability_slots: totalAvailability,
            total_bookings: totalBookings
        });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};



// ============================================================
// 15. GEOGRAPHIC REPORT (SIMPLIFIED)
// ============================================================
// Bookings per field (can map to regions later)

exports.getGeographicReport = async (req, res) => {
    try {
        const result = await Booking.findAll({
            attributes: [
                'field_id',
                [fn('COUNT', col('booking_id')), 'total_bookings']
            ],
            include: [{
                model: Field,
                attributes: ['field_name']
            }],
            group: ['Booking.field_id', 'Field.field_id']
        });

        res.status(200).send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};



// ============================================================
// 16. NOTIFICATION PERFORMANCE REPORT
// ============================================================
// Status of notifications

exports.getNotificationReport = async (req, res) => {
    try {
        const result = await Notification.findAll({
            attributes: [
                'status',
                [fn('COUNT', col('notification_id')), 'total']
            ],
            group: ['status']
        });

        res.status(200).send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};



// ============================================================
// 17. USER REGISTRATION TREND
// ============================================================
// New users over time

exports.getUserRegistrationTrend = async (req, res) => {
    try {
        const result = await User.findAll({
            attributes: [
                [fn('DATE', col('created_at')), 'date'],
                [fn('COUNT', col('user_id')), 'total_users']
            ],
            group: [fn('DATE', col('created_at'))],
            order: [[fn('DATE', col('created_at')), 'ASC']]
        });

        res.status(200).send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};



// ============================================================
// 18. ACTIVE VS INACTIVE USERS
// ============================================================

exports.getUserActivityStatus = async (req, res) => {
    try {
        const result = await User.findAll({
            attributes: [
                'is_active',
                [fn('COUNT', col('user_id')), 'total']
            ],
            group: ['is_active']
        });

        res.status(200).send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};



// ============================================================
// 19. TOP CUSTOMERS REPORT
// ============================================================
// Highest spending farmers

exports.getTopCustomers = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;

        const result = await Booking.findAll({
            attributes: [
                'farmer_id',
                [fn('SUM', col('calculated_cost')), 'total_spent']
            ],
            include: [{
                model: User,
                as: 'farmer', // ✅ must match EXACTLY
                attributes: ['email']
            }],
            group: ['farmer_id', 'farmer.user_id'],
            order: [[literal('total_spent'), 'DESC']],
            limit
        });

        res.status(200).send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};


// ============================================================
// 20. SYSTEM DASHBOARD SUMMARY
// ============================================================
// Combined KPI response (for dashboard cards)

exports.getDashboardSummary = async (req, res) => {
    try {
        const totalBookings = await Booking.count();
        const completedBookings = await Booking.count({
            where: { booking_status: 'COMPLETED' }
        });

        const totalRevenue = await Booking.sum('calculated_cost', {
            where: { booking_status: 'COMPLETED' }
        });

        const totalUsers = await User.count();
        const totalHarvesters = await Harvester.count();

        res.status(200).send({
            total_bookings: totalBookings,
            completed_bookings: completedBookings,
            total_revenue: totalRevenue || 0,
            total_users: totalUsers,
            total_harvesters: totalHarvesters
        });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};