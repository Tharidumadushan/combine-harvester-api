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
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

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



exports.getPlatformMetrics = async (req, res) => {
  try {

    // ── All metrics are calculated for the current calendar month ───────────
    // Using a single query per metric keeps it readable and debuggable.
    // All values are returned as percentages (0-100), rounded to 1 decimal.

    const [metrics] = await sequelize.query(`
      WITH

      -- ── Date boundary ────────────────────────────────────────────────────
      period AS (
        SELECT
          date_trunc('month', NOW())                        AS month_start,
          date_trunc('month', NOW()) + INTERVAL '1 month'  AS month_end
      ),

      -- ── All bookings created this month ──────────────────────────────────
      monthly_bookings AS (
        SELECT
          booking_id,
          farmer_id,
          harvester_id,
          booking_status
        FROM "Bookings", period
        WHERE created_at >= period.month_start
          AND created_at <  period.month_end
      ),

      -- ── Total bookings this month (denominator for most rates) ────────────
      total AS (
        SELECT COUNT(*) AS cnt FROM monthly_bookings
      ),

      -- 1. Booking completion rate
      --    COMPLETED bookings / all terminal bookings
      --    (excludes still-open bookings from the denominator so we measure
      --     how many resolved bookings ended successfully)
      completion AS (
        SELECT
          COUNT(*) FILTER (WHERE booking_status = 'COMPLETED')       AS completed,
          COUNT(*) FILTER (WHERE booking_status IN (
            'COMPLETED','REJECTED',
            'CANCELLED_BY_FARMER','CANCELLED_BY_OWNER'
          ))                                                          AS terminal
        FROM monthly_bookings
      ),

      -- 2. Cancellation rate
      --    Any cancellation / all bookings this month
      cancellation AS (
        SELECT
          COUNT(*) FILTER (WHERE booking_status IN (
            'CANCELLED_BY_FARMER','CANCELLED_BY_OWNER'
          ))                                                          AS cancelled
        FROM monthly_bookings
      ),

      -- 3. Rejection rate
      --    Owner-rejected bookings / all bookings this month
      rejection AS (
        SELECT
          COUNT(*) FILTER (WHERE booking_status = 'REJECTED')        AS rejected
        FROM monthly_bookings
      ),

      -- 4. Farmer retention rate
      --    Farmers who booked MORE THAN ONCE this month / farmers who booked at all
      --    (proxy for retention — repeat engagement within a month)
      farmer_retention AS (
        SELECT
          COUNT(DISTINCT farmer_id) FILTER (
            WHERE booking_count > 1
          )                                                           AS retained,
          COUNT(DISTINCT farmer_id)                                   AS total_farmers
        FROM (
          SELECT farmer_id, COUNT(*) AS booking_count
          FROM monthly_bookings
          GROUP BY farmer_id
        ) f
      ),

      -- 5. Owner satisfaction rate
      --    Owners who ACCEPTED bookings this month / owners who had any request
      --    (acceptance is a proxy for satisfaction — owners who reject everything
      --     are likely dissatisfied with request quality)
      owner_satisfaction AS (
        SELECT
          COUNT(DISTINCT harvester_id) FILTER (WHERE booking_status = 'CONFIRMED') AS satisfied,
          COUNT(DISTINCT harvester_id)                                               AS total_owners
        FROM monthly_bookings
      ),

      -- 6. On-time start rate
      --    Bookings that reached IN_PROGRESS / CONFIRMED bookings
      --    (measures how many confirmed jobs actually started)
      on_time_start AS (
        SELECT
          COUNT(*) FILTER (WHERE booking_status IN ('IN_PROGRESS','COMPLETED')) AS started,
          COUNT(*) FILTER (WHERE booking_status IN (
            'IN_PROGRESS','COMPLETED','CONFIRMED'
          ))                                                                      AS eligible
        FROM monthly_bookings
      ),

      -- 7. Active farmer rate
      --    Farmers with at least 1 booking this month / total registered farmers
      active_farmer AS (
        SELECT
          COUNT(DISTINCT mb.farmer_id)                                AS active,
          (SELECT COUNT(*) FROM "Users" WHERE role = 'FARMER')        AS total
        FROM monthly_bookings mb
      ),

      -- 8. Active harvester rate
      --    Harvesters with at least 1 booking this month / total registered harvesters
      active_harvester AS (
        SELECT
          COUNT(DISTINCT mb.harvester_id)                             AS active,
          (SELECT COUNT(*) FROM "Harvesters")                         AS total
        FROM monthly_bookings mb
      )

      -- ── Final SELECT — assemble all percentages ──────────────────────────
      SELECT

        -- 1. Booking completion rate
        ROUND(
          CASE WHEN completion.terminal = 0 THEN 0
          ELSE (completion.completed::numeric / completion.terminal) * 100
          END, 1
        ) AS booking_completion_rate,

        -- 2. Cancellation rate
        ROUND(
          CASE WHEN total.cnt = 0 THEN 0
          ELSE (cancellation.cancelled::numeric / total.cnt) * 100
          END, 1
        ) AS cancellation_rate,

        -- 3. Rejection rate
        ROUND(
          CASE WHEN total.cnt = 0 THEN 0
          ELSE (rejection.rejected::numeric / total.cnt) * 100
          END, 1
        ) AS rejection_rate,

        -- 4. Farmer retention rate
        ROUND(
          CASE WHEN farmer_retention.total_farmers = 0 THEN 0
          ELSE (farmer_retention.retained::numeric / farmer_retention.total_farmers) * 100
          END, 1
        ) AS farmer_retention_rate,

        -- 5. Owner satisfaction rate (acceptance proxy)
        ROUND(
          CASE WHEN owner_satisfaction.total_owners = 0 THEN 0
          ELSE (owner_satisfaction.satisfied::numeric / owner_satisfaction.total_owners) * 100
          END, 1
        ) AS owner_satisfaction_rate,

        -- 6. On-time start rate
        ROUND(
          CASE WHEN on_time_start.eligible = 0 THEN 0
          ELSE (on_time_start.started::numeric / on_time_start.eligible) * 100
          END, 1
        ) AS on_time_start_rate,

        -- 7. Active farmer rate
        ROUND(
          CASE WHEN active_farmer.total = 0 THEN 0
          ELSE (active_farmer.active::numeric / active_farmer.total) * 100
          END, 1
        ) AS active_farmer_rate,

        -- 8. Active harvester utilisation
        ROUND(
          CASE WHEN active_harvester.total = 0 THEN 0
          ELSE (active_harvester.active::numeric / active_harvester.total) * 100
          END, 1
        ) AS harvester_utilisation_rate,

        -- Raw counts for context (useful for the frontend tooltip)
        total.cnt                         AS total_bookings_month,
        completion.completed              AS completed_bookings,
        cancellation.cancelled            AS cancelled_bookings,
        rejection.rejected                AS rejected_bookings,
        farmer_retention.total_farmers    AS active_farmers_month,
        active_harvester.active           AS active_harvesters_month

      FROM
        completion,
        cancellation,
        rejection,
        farmer_retention,
        owner_satisfaction,
        on_time_start,
        active_farmer,
        active_harvester,
        total
    `, { type: QueryTypes.SELECT });

    // ── Shape into the frontend MetricBar format ─────────────────────────────
    const result = metrics || {};

    const metricBars = [
      {
        label: 'Booking completion rate',
        value: parseFloat(result.booking_completion_rate) || 0,
        color: 'green',
        raw:   { completed: result.completed_bookings, total: result.total_bookings_month },
      },
      {
        label: 'Farmer retention',
        value: parseFloat(result.farmer_retention_rate) || 0,
        color: 'green',
        raw:   { retained: result.active_farmers_month },
      },
      {
        label: 'Owner satisfaction',
        value: parseFloat(result.owner_satisfaction_rate) || 0,
        color: 'blue',
        raw:   null,
      },
      {
        label: 'On-time start rate',
        value: parseFloat(result.on_time_start_rate) || 0,
        color: 'blue',
        raw:   null,
      },
      {
        label: 'Active harvester utilisation',
        value: parseFloat(result.harvester_utilisation_rate) || 0,
        color: 'green',
        raw:   { active: result.active_harvesters_month },
      },
      {
        label: 'Active farmer rate',
        value: parseFloat(result.active_farmer_rate) || 0,
        color: 'green',
        raw:   null,
      },
      {
        label: 'Cancellation rate',
        value: parseFloat(result.cancellation_rate) || 0,
        color: 'amber',
        raw:   { cancelled: result.cancelled_bookings, total: result.total_bookings_month },
      },
      {
        label: 'Rejection rate',
        value: parseFloat(result.rejection_rate) || 0,
        color: 'amber',
        raw:   { rejected: result.rejected_bookings, total: result.total_bookings_month },
      },
    ];

    return res.status(200).json({
      period: new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' }),
      metrics: metricBars,
    });

  } catch (error) {
    console.error('[getPlatformMetrics]', error);
    return res.status(500).json({
      message: error.message || 'Failed to load platform metrics.',
    });
  }
};

// ─── GET /analytics/growth-trends ────────────────────────────────────────────
// Returns monthly counts for the last 6 months for:
// new farmer registrations, owner registrations, field registrations,
// harvester creations, and booking creations.
exports.getGrowthTrends = async (req, res) => {
  try {
    const rows = await sequelize.query(`
      WITH

      -- ── Build a series of the last 6 calendar months ─────────────────────
      months AS (
        SELECT
          generate_series(
            date_trunc('month', NOW()) - INTERVAL '5 months',
            date_trunc('month', NOW()),
            INTERVAL '1 month'
          ) AS month_start
      ),

      -- ── New farmer registrations per month ────────────────────────────────
      farmers AS (
        SELECT
          date_trunc('month', created_at) AS month,
          COUNT(*)                        AS cnt
        FROM "Users"
        WHERE role = 'FARMER'
          AND created_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
        GROUP BY 1
      ),

      -- ── New harvester owner registrations per month ───────────────────────
      owners AS (
        SELECT
          date_trunc('month', created_at) AS month,
          COUNT(*)                        AS cnt
        FROM "Users"
        WHERE role = 'HARVESTER_OWNER'
          AND created_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
        GROUP BY 1
      ),

      -- ── New field registrations per month ─────────────────────────────────
      fields AS (
        SELECT
          date_trunc('month', created_at) AS month,
          COUNT(*)                        AS cnt
        FROM "Fields"
        WHERE created_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
        GROUP BY 1
      ),

      -- ── New harvester creations per month ─────────────────────────────────
      harvesters AS (
        SELECT
          date_trunc('month', created_at) AS month,
          COUNT(*)                        AS cnt
        FROM "Harvesters"
        WHERE created_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
        GROUP BY 1
      ),

      -- ── New bookings created per month ────────────────────────────────────
      bookings AS (
        SELECT
          date_trunc('month', created_at) AS month,
          COUNT(*)                        AS cnt
        FROM "Bookings"
        WHERE created_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
        GROUP BY 1
      )

      -- ── LEFT JOIN all series onto the months spine ────────────────────────
      -- COALESCE(x, 0) ensures months with zero activity show 0, not NULL
      SELECT
        TO_CHAR(m.month_start, 'Mon YYYY')    AS month_label,
        m.month_start                         AS month_start,
        COALESCE(f.cnt,  0)::int              AS farmers,
        COALESCE(o.cnt,  0)::int              AS owners,
        COALESCE(fi.cnt, 0)::int              AS fields,
        COALESCE(h.cnt,  0)::int              AS harvesters,
        COALESCE(b.cnt,  0)::int              AS bookings
      FROM  months         m
      LEFT JOIN farmers    f  ON f.month  = m.month_start
      LEFT JOIN owners     o  ON o.month  = m.month_start
      LEFT JOIN fields     fi ON fi.month = m.month_start
      LEFT JOIN harvesters h  ON h.month  = m.month_start
      LEFT JOIN bookings   b  ON b.month  = m.month_start
      ORDER BY m.month_start ASC
    `, { type: QueryTypes.SELECT });

    // ── Shape into parallel arrays the frontend chart expects ────────────────
    // Each array has exactly 6 entries, index 0 = oldest month
    const response = {
      labels:     rows.map((r) => r.month_label),          // ["Dec 2024", "Jan 2025", ...]
      farmers:    rows.map((r) => parseInt(r.farmers)),
      owners:     rows.map((r) => parseInt(r.owners)),
      fields:     rows.map((r) => parseInt(r.fields)),
      harvesters: rows.map((r) => parseInt(r.harvesters)),
      bookings:   rows.map((r) => parseInt(r.bookings)),
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('[getGrowthTrends]', error);
    return res.status(500).json({
      message: error.message || 'Failed to load growth trends.',
    });
  }
};