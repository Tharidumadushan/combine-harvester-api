const db = require('../models');
const { Op, fn, col, literal } = require('sequelize');

const Booking = db.Booking;
const Harvester = db.Harvester;
const User = db.User;
const Field = db.Field;
const Notification = db.Notification;
const HarvesterAvailability = db.HarvesterAvailability;
const Farmer = db.Farmer;

const { QueryTypes } = require('sequelize');

// ---------------------------------------------------------------------------
// Helper: validate that a string is an accepted DATE_TRUNC granularity.
// Only these values are passed into raw SQL, so we whitelist them strictly
// to prevent SQL injection via the :period parameter (Sequelize bind params
// do not work inside DATE_TRUNC string arguments).
// ---------------------------------------------------------------------------
const VALID_PERIODS = ['day', 'week', 'month', 'quarter', 'year'];
const VALID_RATE_TYPES = ['PER_AREA', 'PER_HOUR'];
const VALID_ROLES = ['FARMER', 'HARVESTER_OWNER', 'ADMIN'];
const VALID_CHANNELS = ['SMS', 'EMAIL', 'PUSH'];
const VALID_NOTIF_STATUSES = ['PENDING', 'SENT', 'FAILED'];


// ---------------------------------------------------------------------------
// Helper: parse and validate pagination params
// ---------------------------------------------------------------------------
const parsePagination = (query) => {
  const page  = Math.max(1, parseInt(query.page)  || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const validatePeriod = (period) => {
  if (!VALID_PERIODS.includes(period)) {
    throw new Error(
      `Invalid period '${period}'. Must be one of: ${VALID_PERIODS.join(', ')}.`
    );
  }
  return period;
};

const validateEnum = (value, allowed, label) => {
  if (!allowed.includes(value)) {
    throw new Error(`Invalid ${label} '${value}'. Accepted: ${allowed.join(', ')}.`);
  }
  return value;
};

const parseTopN = (query, def = 10) =>
  Math.min(100, Math.max(1, parseInt(query.top_n) || def));
 

// ===========================================================================
// REPORT 1 — Booking volume over time
//
// GET /api/mis/bookings/volume
//
// Query params (all optional except start_date / end_date):
//   start_date   {ISO date}          e.g. 2024-01-01
//   end_date     {ISO date}          e.g. 2024-12-31
//   period       {day|week|month|quarter|year}  default: month
//   booking_status {string}          filter to a single status
//   harvester_id {uuid}              filter to a single harvester
//   farmer_id    {uuid}              filter to a single farmer
// ===========================================================================
exports.getBookingVolume = async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      period      = 'month',
      booking_status,
      harvester_id,
      farmer_id,
    } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).send({ message: 'start_date and end_date are required.' });
    }

    // Whitelist period before embedding in SQL string
    const safePeriod = validatePeriod(period);

    // Build optional WHERE clauses and bind replacements
    const conditions = [
      `b.created_at BETWEEN :start_date AND :end_date`
    ];
    const replacements = { start_date, end_date };

    if (booking_status) {
      conditions.push(`b.booking_status = :booking_status`);
      replacements.booking_status = booking_status;
    }
    if (harvester_id) {
      conditions.push(`b.harvester_id = :harvester_id`);
      replacements.harvester_id = harvester_id;
    }
    if (farmer_id) {
      conditions.push(`b.farmer_id = :farmer_id`);
      replacements.farmer_id = farmer_id;
    }

    const whereClause = conditions.join(' AND ');

    // Main volume-by-period query
    const volumeRows = await db.sequelize.query(
      `SELECT
          DATE_TRUNC('${safePeriod}', b.created_at)  AS period,
          b.booking_status,
          COUNT(*)                                    AS booking_count,
          SUM(b.calculated_cost)                      AS total_cost,
          ROUND(AVG(b.calculated_cost), 2)            AS avg_cost
       FROM public."Bookings" b
       WHERE ${whereClause}
       GROUP BY 1, 2
       ORDER BY 1 ASC, 2 ASC`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Summary totals across the entire period (useful for dashboard cards)
    const [summary] = await db.sequelize.query(
      `SELECT
          COUNT(*)                                AS total_bookings,
          COUNT(DISTINCT b.farmer_id)             AS unique_farmers,
          COUNT(DISTINCT b.harvester_id)          AS unique_harvesters,
          SUM(b.calculated_cost)                  AS total_revenue,
          ROUND(AVG(b.calculated_cost), 2)        AS avg_cost,
          COUNT(*) FILTER (WHERE b.booking_status = 'COMPLETED')  AS completed,
          COUNT(*) FILTER (WHERE b.booking_status IN ('CANCELLED_BY_FARMER', 'CANCELLED_BY_OWNER')) AS cancelled,
          COUNT(*) FILTER (WHERE b.booking_status = 'CONFIRMED')  AS confirmed,
          COUNT(*) FILTER (WHERE b.booking_status = 'REQUESTED')  AS requested
       FROM public."Bookings" b
       WHERE ${whereClause}`,
      { replacements, type: QueryTypes.SELECT }
    );


    return res.status(200).send({
      report:       'booking_volume_over_time',
      period_used:  safePeriod,
      filters:      { start_date, end_date, booking_status, harvester_id, farmer_id },
      summary:      summary,
      data:         volumeRows,
    });

  } catch (error) {
    console.error('[MIS] getBookingVolume error:', error);
    return res.status(500).send({ message: error.message || 'Error generating booking volume report.' });
  }
};


// ===========================================================================
// REPORT 2 — Booking status funnel
//
// GET /api/mis/bookings/funnel
//
// Query params:
//   start_date   {ISO date}          required
//   end_date     {ISO date}          required
//   harvester_id {uuid}              optional
//   farmer_id    {uuid}              optional
// ===========================================================================
exports.getBookingStatusFunnel = async (req, res) => {
  try {
    const { start_date, end_date, harvester_id, farmer_id } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).send({ message: 'start_date and end_date are required.' });
    }

    const conditions = [`b.created_at BETWEEN :start_date AND :end_date`];
    const replacements = { start_date, end_date };

    if (harvester_id) {
      conditions.push(`b.harvester_id = :harvester_id`);
      replacements.harvester_id = harvester_id;
    }
    if (farmer_id) {
      conditions.push(`b.farmer_id = :farmer_id`);
      replacements.farmer_id = farmer_id;
    }

    const whereClause = conditions.join(' AND ');

    // Status distribution with percentage share
    const funnelRows = await db.sequelize.query(
      `SELECT
          b.booking_status                                               AS status,
          COUNT(*)                                                       AS count,
          ROUND(
            COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 2
          )                                                              AS percentage,
          ROUND(AVG(b.calculated_cost), 2)                              AS avg_cost,
          SUM(b.calculated_cost)                                        AS total_cost
       FROM public."Bookings" b
       WHERE ${whereClause}
       GROUP BY b.booking_status
       ORDER BY
         CASE b.booking_status
           WHEN 'REQUESTED'  THEN 1
           WHEN 'CONFIRMED'  THEN 2
           WHEN 'COMPLETED'  THEN 3
           WHEN 'REJECTED'  THEN 4
           ELSE 5
         END`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Calculate derived conversion & cancellation rates
    const counts = {};
    funnelRows.forEach(r => { counts[r.status] = parseInt(r.count); });

    const total       = Object.values(counts).reduce((a, b) => a + b, 0);
    const requested   = counts['REQUESTED']  || 0;
    const confirmed   = counts['CONFIRMED']  || 0;
    const completed   = counts['COMPLETED']  || 0;
    const rejected   = counts['REJECTED']  || 0;

    const rates = {
      request_to_confirm_rate:  requested  ? +((confirmed  / requested)  * 100).toFixed(2) : null,
      confirm_to_complete_rate: confirmed  ? +((completed  / confirmed)  * 100).toFixed(2) : null,
      overall_completion_rate:  total      ? +((completed  / total)      * 100).toFixed(2) : null,
      cancellation_rate:        total      ? +((rejected  / total)      * 100).toFixed(2) : null,
    };

    return res.status(200).send({
      report:   'booking_status_funnel',
      filters:  { start_date, end_date, harvester_id, farmer_id },
      rates,
      data:     funnelRows,
    });

  } catch (error) {
    console.error('[MIS] getBookingStatusFunnel error:', error);
    return res.status(500).send({ message: error.message || 'Error generating booking funnel report.' });
  }
};


// ===========================================================================
// REPORT 3 — Status change audit log
//
// GET /api/mis/bookings/audit-log
//
// Query params:
//   start_date         {ISO date}    required
//   end_date           {ISO date}    required
//   status             {string}      filter to a specific status value
//   changed_by_user_id {uuid}        filter to changes made by a specific user
//   booking_id         {uuid}        filter to a specific booking
//   page               {number}      default: 1
//   limit              {number}      default: 50  (max: 200)
// ===========================================================================
exports.getStatusAuditLog = async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      status,
      changed_by_user_id,
      booking_id,
    } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).send({ message: 'start_date and end_date are required.' });
    }

    const { page, limit, offset } = parsePagination(req.query);

    const conditions = [`bsh.change_time BETWEEN :start_date AND :end_date`];
    const replacements = { start_date, end_date, limit, offset };

    if (status) {
      conditions.push(`bsh.status = :status`);
      replacements.status = status;
    }
    if (changed_by_user_id) {
      conditions.push(`bsh.changed_by_user_id = :changed_by_user_id`);
      replacements.changed_by_user_id = changed_by_user_id;
    }
    if (booking_id) {
      conditions.push(`bsh.booking_id = :booking_id`);
      replacements.booking_id = booking_id;
    }

    const whereClause = conditions.join(' AND ');

    // Paginated log rows with joined user and booking details
    const logRows = await db.sequelize.query(
      `SELECT
          bsh.history_id,
          bsh.change_time,
          bsh.booking_id,
          bsh.status                                                         AS new_status,
          bsh.changed_by_user_id,
          u.email                                                            AS changed_by_email,
          up.first_name || ' ' || up.last_name                              AS changed_by_name,
          u.role                                                             AS changed_by_role,
          b.booking_status                                                   AS current_booking_status,
          b.farmer_id,
          b.harvester_id
       FROM public."BookingStatusHistory" bsh
       LEFT JOIN public."Users"        u   ON u.user_id       = bsh.changed_by_user_id
       LEFT JOIN public."UserProfiles" up  ON up.user_id      = bsh.changed_by_user_id
       LEFT JOIN public."Bookings"     b   ON b.booking_id    = bsh.booking_id
       WHERE ${whereClause}
       ORDER BY bsh.change_time DESC
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Total count for pagination metadata
    const [{ total_count }] = await db.sequelize.query(
      `SELECT COUNT(*) AS total_count
       FROM public."BookingStatusHistory" bsh
       WHERE ${whereClause}`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Summary: changes per status type within the period
    const changesByStatus = await db.sequelize.query(
      `SELECT
          bsh.status,
          COUNT(*)                        AS change_count,
          COUNT(DISTINCT bsh.booking_id)  AS unique_bookings_affected
       FROM public."BookingStatusHistory" bsh
       WHERE ${whereClause}
       GROUP BY bsh.status
       ORDER BY change_count DESC`,
      { replacements, type: QueryTypes.SELECT }
    );

    const totalCount = parseInt(total_count);

    return res.status(200).send({
      report:           'status_change_audit_log',
      filters:          { start_date, end_date, status, changed_by_user_id, booking_id },
      pagination: {
        page,
        limit,
        total_records:  totalCount,
        total_pages:    Math.ceil(totalCount / limit),
      },
      summary_by_status: changesByStatus,
      data:             logRows,
    });

  } catch (error) {
    console.error('[MIS] getStatusAuditLog error:', error);
    return res.status(500).send({ message: error.message || 'Error generating audit log report.' });
  }
};


// ===========================================================================
// REPORT 4 — Revenue Summary
//
// GET /api/mis/revenue/summary
//
// Query params:
//   start_date   {ISO date}                         required
//   end_date     {ISO date}                         required
//   period       {day|week|month|quarter|year}       default: month
//   rate_type    {PER_AREA|PER_HOUR}                optional
//   harvester_id {uuid}                              optional
// ===========================================================================
exports.getRevenueSummary = async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      period     = 'month',
      rate_type,
      harvester_id,
    } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).send({ message: 'start_date and end_date are required.' });
    }

    const safePeriod = validatePeriod(period);
    if (rate_type) validateEnum(rate_type, VALID_RATE_TYPES, 'rate_type');

    const conditions   = [`b.booking_status = 'COMPLETED'`, `b.created_at BETWEEN :start_date AND :end_date`];
    const replacements = { start_date, end_date };

    if (rate_type) {
      conditions.push(`hp.rate_type = :rate_type`);
      replacements.rate_type = rate_type;
    }
    if (harvester_id) {
      conditions.push(`b.harvester_id = :harvester_id`);
      replacements.harvester_id = harvester_id;
    }

    const whereClause = conditions.join(' AND ');

    // Period-level breakdown (grouped by period + rate_type)
    const periodRows = await db.sequelize.query(
      `SELECT
          DATE_TRUNC('${safePeriod}', b.created_at) AS period,
          hp.rate_type,
          COUNT(b.booking_id)                        AS booking_count,
          SUM(b.calculated_cost)                     AS total_revenue,
          ROUND(AVG(b.calculated_cost), 2)           AS avg_cost,
          MIN(b.calculated_cost)                     AS min_cost,
          MAX(b.calculated_cost)                     AS max_cost
       FROM public."Bookings"        b
       JOIN public."HarvesterPricing" hp ON hp.pricing_id = b.pricing_id
       WHERE ${whereClause}
       GROUP BY 1, 2
       ORDER BY 1 ASC, 2 ASC`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Overall summary for the full date range
    const [summary] = await db.sequelize.query(
      `SELECT
          COUNT(b.booking_id)              AS total_completed_bookings,
          SUM(b.calculated_cost)           AS total_revenue,
          ROUND(AVG(b.calculated_cost), 2) AS avg_cost,
          MIN(b.calculated_cost)           AS min_cost,
          MAX(b.calculated_cost)           AS max_cost,
          COUNT(DISTINCT b.harvester_id)   AS unique_harvesters,
          COUNT(DISTINCT b.farmer_id)      AS unique_farmers,
          COUNT(DISTINCT hp.rate_type)     AS rate_types_used
       FROM public."Bookings"        b
       JOIN public."HarvesterPricing" hp ON hp.pricing_id = b.pricing_id
       WHERE ${whereClause}`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Revenue split by rate_type for the full range
    const byRateType = await db.sequelize.query(
      `SELECT
          hp.rate_type,
          COUNT(b.booking_id)   AS booking_count,
          SUM(b.calculated_cost) AS total_revenue,
          ROUND(
            SUM(b.calculated_cost) * 100.0 /
            NULLIF(SUM(SUM(b.calculated_cost)) OVER (), 0), 2
          )                     AS revenue_pct
       FROM public."Bookings"        b
       JOIN public."HarvesterPricing" hp ON hp.pricing_id = b.pricing_id
       WHERE ${whereClause}
       GROUP BY hp.rate_type`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).send({
      report:      'revenue_summary',
      period_used: safePeriod,
      filters:     { start_date, end_date, rate_type, harvester_id },
      summary,
      by_rate_type: byRateType,
      data:        periodRows,
    });

  } catch (error) {
    console.error('[MIS] getRevenueSummary error:', error);
    return res.status(500).send({ message: error.message || 'Error generating revenue summary.' });
  }
};


// ===========================================================================
// REPORT 5 — Revenue by Harvester
//
// GET /api/mis/revenue/by-harvester
//
// Query params:
//   start_date   {ISO date}          required
//   end_date     {ISO date}          required
//   top_n        {number}            default: 10  (max: 100)
//   rate_type    {PER_AREA|PER_HOUR} optional
// ===========================================================================
exports.getRevenueByHarvester = async (req, res) => {
  try {
    const { start_date, end_date, rate_type } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).send({ message: 'start_date and end_date are required.' });
    }

    if (rate_type) validateEnum(rate_type, VALID_RATE_TYPES, 'rate_type');

    const topN         = parseTopN(req.query);
    const conditions   = [`b.booking_status = 'COMPLETED'`, `b.created_at BETWEEN :start_date AND :end_date`];
    const replacements = { start_date, end_date, top_n: topN };

    if (rate_type) {
      conditions.push(`hp.rate_type = :rate_type`);
      replacements.rate_type = rate_type;
    }

    const whereClause = conditions.join(' AND ');

    // Top N harvesters by revenue
    const topHarvesters = await db.sequelize.query(
      `SELECT
          h.harvester_id,
          h.model_name,
          h.capacity,
          hp.rate_type,
          hp.price_per_unit,
          hp.currency,
          up.first_name || ' ' || up.last_name   AS owner_name,
          up.city                                 AS owner_city,
          COUNT(b.booking_id)                     AS completed_bookings,
          SUM(b.calculated_cost)                  AS total_revenue,
          ROUND(AVG(b.calculated_cost), 2)        AS avg_revenue_per_booking
       FROM public."Bookings"        b
       JOIN public."Harvesters"       h   ON h.harvester_id  = b.harvester_id
       JOIN public."HarvesterPricing" hp  ON hp.pricing_id   = b.pricing_id
       JOIN public."UserProfiles"     up  ON up.user_id      = h.owner_id
       WHERE ${whereClause}
       GROUP BY h.harvester_id, h.model_name, h.capacity,
                hp.rate_type, hp.price_per_unit, hp.currency,
                owner_name, owner_city
       ORDER BY total_revenue DESC
       LIMIT :top_n`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Overall stats (useful for context / rank percentages)
    const [platformTotals] = await db.sequelize.query(
      `SELECT
          COUNT(DISTINCT b.harvester_id)  AS total_active_harvesters,
          SUM(b.calculated_cost)          AS platform_total_revenue,
          ROUND(AVG(b.calculated_cost), 2) AS platform_avg_cost
       FROM public."Bookings"        b
       JOIN public."HarvesterPricing" hp ON hp.pricing_id = b.pricing_id
       WHERE ${whereClause}`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).send({
      report:          'revenue_by_harvester',
      filters:         { start_date, end_date, top_n: topN, rate_type },
      platform_totals: platformTotals,
      data:            topHarvesters,
    });

  } catch (error) {
    console.error('[MIS] getRevenueByHarvester error:', error);
    return res.status(500).send({ message: error.message || 'Error generating revenue by harvester report.' });
  }
};


// ===========================================================================
// REPORT 6 — New User Registrations
//
// GET /api/mis/users/registrations
//
// Query params:
//   start_date   {ISO date}                         required
//   end_date     {ISO date}                         required
//   period       {day|week|month|quarter|year}       default: month
//   role         {FARMER|HARVESTER_OWNER|ADMIN}      optional
//   is_active    {true|false}                        optional
// ===========================================================================
exports.getUserRegistrations = async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      period    = 'month',
      role,
      is_active,
    } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).send({ message: 'start_date and end_date are required.' });
    }

    const safePeriod = validatePeriod(period);
    if (role) validateEnum(role, VALID_ROLES, 'role');

    const conditions   = [`u.created_at BETWEEN :start_date AND :end_date`];
    const replacements = { start_date, end_date };

    if (role) {
      conditions.push(`u.role = :role`);
      replacements.role = role;
    }
    if (is_active !== undefined && is_active !== '') {
      conditions.push(`u.is_active = :is_active`);
      replacements.is_active = is_active === 'true';
    }

    const whereClause = conditions.join(' AND ');

    // Period + role breakdown
    const periodRows = await db.sequelize.query(
      `SELECT
          DATE_TRUNC('${safePeriod}', u.created_at) AS period,
          u.role,
          COUNT(*)                                   AS new_users,
          COUNT(*) FILTER (WHERE u.is_active = true) AS active_users,
          COUNT(*) FILTER (WHERE u.is_active = false) AS inactive_users
       FROM public."Users" u
       WHERE ${whereClause}
       GROUP BY 1, 2
       ORDER BY 1 ASC, 2 ASC`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Overall summary for the full range
    const [summary] = await db.sequelize.query(
      `SELECT
          COUNT(*)                                    AS total_new_users,
          COUNT(*) FILTER (WHERE u.role = 'FARMER')           AS farmers,
          COUNT(*) FILTER (WHERE u.role = 'HARVESTER_OWNER')  AS harvester_owners,
          COUNT(*) FILTER (WHERE u.role = 'SYSTEM_ADMIN')            AS admins,
          COUNT(*) FILTER (WHERE u.is_active = true)          AS currently_active
       FROM public."Users" u
       WHERE ${whereClause}`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).send({
      report:      'user_registrations',
      period_used: safePeriod,
      filters:     { start_date, end_date, role, is_active },
      summary,
      data:        periodRows,
    });

  } catch (error) {
    console.error('[MIS] getUserRegistrations error:', error);
    return res.status(500).send({ message: error.message || 'Error generating user registrations report.' });
  }
};


// ===========================================================================
// REPORT 7 — Top Farmers by Activity
//
// GET /api/mis/users/top-farmers
//
// Query params:
//   start_date     {ISO date}          required
//   end_date       {ISO date}          required
//   top_n          {number}            default: 10  (max: 100)
//   booking_status {string}            optional — filter bookings by status
// ===========================================================================
exports.getTopFarmers = async (req, res) => {
  try {
    const { start_date, end_date, booking_status } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).send({ message: 'start_date and end_date are required.' });
    }

    const topN         = parseTopN(req.query);
    const conditions   = [`b.created_at BETWEEN :start_date AND :end_date`];
    const replacements = { start_date, end_date, top_n: topN };

    if (booking_status) {
      conditions.push(`b.booking_status = :booking_status`);
      replacements.booking_status = booking_status;
    }

    const whereClause = conditions.join(' AND ');

    const topFarmers = await db.sequelize.query(
      `SELECT
          b.farmer_id,
          up.first_name || ' ' || up.last_name    AS farmer_name,
          up.city,
          up.state_province,
          u.email,
          u.phone_number,
          COUNT(b.booking_id)                      AS total_bookings,
          COUNT(b.booking_id) FILTER (WHERE b.booking_status = 'COMPLETED')  AS completed,
          COUNT(b.booking_id) FILTER (WHERE b.booking_status IN ('CANCELLED_BY_FARMER', 'CANCELLED_BY_OWNER'))  AS cancelled,
          SUM(b.calculated_cost)
            FILTER (WHERE b.booking_status = 'COMPLETED')                    AS total_spend,
          ROUND(AVG(b.calculated_cost)
            FILTER (WHERE b.booking_status = 'COMPLETED'), 2)                AS avg_spend
       FROM public."Bookings"     b
       JOIN public."UserProfiles" up ON up.user_id = b.farmer_id
       JOIN public."Users"        u  ON u.user_id  = b.farmer_id
       WHERE ${whereClause}
       GROUP BY b.farmer_id, farmer_name, up.city, up.state_province,
                u.email, u.phone_number
       ORDER BY total_bookings DESC, total_spend DESC NULLS LAST
       LIMIT :top_n`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Platform-wide farmer summary for context
    const [platformSummary] = await db.sequelize.query(
      `SELECT
          COUNT(DISTINCT b.farmer_id)     AS total_active_farmers,
          SUM(b.calculated_cost)
            FILTER (WHERE b.booking_status = 'COMPLETED') AS platform_total_spend,
          ROUND(AVG(b.calculated_cost)
            FILTER (WHERE b.booking_status = 'COMPLETED'), 2) AS platform_avg_spend
       FROM public."Bookings" b
       WHERE b.created_at BETWEEN :start_date AND :end_date`,
      { replacements: { start_date, end_date }, type: QueryTypes.SELECT }
    );

    return res.status(200).send({
      report:           'top_farmers_by_activity',
      filters:          { start_date, end_date, top_n: topN, booking_status },
      platform_summary: platformSummary,
      data:             topFarmers,
    });

  } catch (error) {
    console.error('[MIS] getTopFarmers error:', error);
    return res.status(500).send({ message: error.message || 'Error generating top farmers report.' });
  }
};


// ===========================================================================
// REPORT 8 — Harvester Utilisation
//
// GET /api/mis/harvesters/utilisation
//
// Query params:
//   start_date   {ISO date}   required
//   end_date     {ISO date}   required
//   harvester_id {uuid}       optional
//   owner_id     {uuid}       optional
// ===========================================================================
exports.getHarvesterUtilisation = async (req, res) => {
  try {
    const { start_date, end_date, harvester_id, owner_id } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).send({ message: 'start_date and end_date are required.' });
    }

    const conditions   = [`lower(ha.availability_range) BETWEEN :start_date AND :end_date`];
    const replacements = { start_date, end_date };

    if (harvester_id) {
      conditions.push(`h.harvester_id = :harvester_id`);
      replacements.harvester_id = harvester_id;
    }
    if (owner_id) {
      conditions.push(`h.owner_id = :owner_id`);
      replacements.owner_id = owner_id;
    }

    const whereClause = conditions.join(' AND ');

    // Per-harvester utilisation
    const utilisationRows = await db.sequelize.query(
      `SELECT
          h.harvester_id,
          h.model_name,
          h.capacity,
          h.is_active,
          up.first_name || ' ' || up.last_name                                AS owner_name,
          up.city                                                              AS owner_city,
          COUNT(DISTINCT ha.availability_id)                                   AS availability_slots,
          ROUND(
            SUM(
              EXTRACT(EPOCH FROM (upper(ha.availability_range) - lower(ha.availability_range)))
            ) / 3600.0, 2
          )                                                                    AS total_available_hours,
          ROUND(
            COALESCE(SUM(
              EXTRACT(EPOCH FROM (upper(b.booking_time_range) - lower(b.booking_time_range)))
            ) / 3600.0, 0), 2
          )                                                                    AS total_booked_hours,
          ROUND(
            COALESCE(SUM(
              EXTRACT(EPOCH FROM (upper(b.booking_time_range) - lower(b.booking_time_range)))
            ), 0) * 100.0 /
            NULLIF(SUM(
              EXTRACT(EPOCH FROM (upper(ha.availability_range) - lower(ha.availability_range)))
            ), 0), 2
          )                                                                    AS utilisation_pct,
          COUNT(DISTINCT b.booking_id)                                         AS total_bookings,
          SUM(b.calculated_cost)                                               AS total_revenue
       FROM public."HarvesterAvailability" ha
       JOIN public."Harvesters"            h   ON h.harvester_id  = ha.harvester_id
       JOIN public."UserProfiles"          up  ON up.user_id      = h.owner_id
       LEFT JOIN public."Bookings"         b
         ON b.availability_id = ha.availability_id
         AND b.booking_status IN ('CONFIRMED', 'COMPLETED')
       WHERE ${whereClause}
       GROUP BY h.harvester_id, h.model_name, h.capacity, h.is_active,
                owner_name, owner_city
       ORDER BY utilisation_pct DESC NULLS LAST`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Fleet-level summary
    const [fleetSummary] = await db.sequelize.query(
      `SELECT
          COUNT(DISTINCT h.harvester_id)                AS total_harvesters,
          COUNT(DISTINCT h.harvester_id)
            FILTER (WHERE h.is_active = true)           AS active_harvesters,
          ROUND(AVG(
            COALESCE(
              EXTRACT(EPOCH FROM (upper(b.booking_time_range) - lower(b.booking_time_range))), 0
            ) * 100.0 /
            NULLIF(
              EXTRACT(EPOCH FROM (upper(ha.availability_range) - lower(ha.availability_range))), 0
            )
          ), 2)                                         AS avg_utilisation_pct
       FROM public."HarvesterAvailability" ha
       JOIN public."Harvesters"            h  ON h.harvester_id  = ha.harvester_id
       LEFT JOIN public."Bookings"         b
         ON b.availability_id = ha.availability_id
         AND b.booking_status IN ('CONFIRMED', 'COMPLETED')
       WHERE ${whereClause}`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Idle harvesters (< 20% utilisation)
    const idleCount = utilisationRows.filter(
      r => parseFloat(r.utilisation_pct || '0') < 20
    ).length;

    return res.status(200).send({
      report:        'harvester_utilisation',
      filters:       { start_date, end_date, harvester_id, owner_id },
      fleet_summary: { ...fleetSummary, idle_harvesters: idleCount },
      data:          utilisationRows,
    });

  } catch (error) {
    console.error('[MIS] getHarvesterUtilisation error:', error);
    return res.status(500).send({ message: error.message || 'Error generating harvester utilisation report.' });
  }
};


// ===========================================================================
// REPORT 9 — Harvester Pricing Overview
//
// GET /api/mis/harvesters/pricing
//
// Query params (all optional — no date range needed, reflects current state):
//   rate_type    {PER_AREA|PER_HOUR}   optional
//   currency     {string e.g. LKR}     optional
//   active_only  {true|false}          optional, default: false
// ===========================================================================
exports.getHarvesterPricingOverview = async (req, res) => {
  try {
    const { rate_type, currency, active_only } = req.query;

    if (rate_type) validateEnum(rate_type, VALID_RATE_TYPES, 'rate_type');

    const conditions   = [];
    const replacements = {};

    if (rate_type) {
      conditions.push(`hp.rate_type = :rate_type`);
      replacements.rate_type = rate_type;
    }
    if (currency) {
      conditions.push(`UPPER(hp.currency) = UPPER(:currency)`);
      replacements.currency = currency;
    }
    if (active_only === 'true') {
      conditions.push(`h.is_active = true`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const pricingRows = await db.sequelize.query(
      `SELECT
          h.harvester_id,
          h.model_name,
          h.description,
          h.capacity,
          h.is_active,
          up.first_name || ' ' || up.last_name    AS owner_name,
          up.city                                  AS owner_city,
          u.email                                  AS owner_email,
          hp.pricing_id,
          hp.rate_type,
          hp.price_per_unit,
          hp.currency,
          -- Booking stats (all time)
          COUNT(b.booking_id)                      AS total_bookings,
          COUNT(b.booking_id)
            FILTER (WHERE b.booking_status = 'COMPLETED') AS completed_bookings,
          SUM(b.calculated_cost)
            FILTER (WHERE b.booking_status = 'COMPLETED') AS total_revenue
       FROM public."Harvesters"       h
       JOIN public."HarvesterPricing"  hp ON hp.harvester_id = h.harvester_id
       JOIN public."UserProfiles"      up ON up.user_id      = h.owner_id
       JOIN public."Users"             u  ON u.user_id       = h.owner_id
       LEFT JOIN public."Bookings"     b  ON b.harvester_id  = h.harvester_id
       ${whereClause}
       GROUP BY h.harvester_id, h.model_name, h.description, h.capacity, h.is_active,
                owner_name, owner_city, owner_email,
                hp.pricing_id, hp.rate_type, hp.price_per_unit, hp.currency
       ORDER BY h.is_active DESC, h.model_name ASC`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Aggregate pricing stats
    const [pricingStats] = await db.sequelize.query(
      `SELECT
          COUNT(DISTINCT h.harvester_id)                         AS total_harvesters,
          COUNT(DISTINCT h.harvester_id) FILTER (WHERE h.is_active = true) AS active_harvesters,
          COUNT(DISTINCT hp.pricing_id)                          AS total_pricing_rules,
          ROUND(AVG(hp.price_per_unit) FILTER (WHERE hp.rate_type = 'PER_AREA'), 2) AS avg_price_per_area,
          ROUND(AVG(hp.price_per_unit) FILTER (WHERE hp.rate_type = 'PER_HOUR'), 2) AS avg_price_per_hour,
          MIN(hp.price_per_unit)                                 AS min_price,
          MAX(hp.price_per_unit)                                 AS max_price
       FROM public."Harvesters"      h
       JOIN public."HarvesterPricing" hp ON hp.harvester_id = h.harvester_id
       ${whereClause}`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).send({
      report:        'harvester_pricing_overview',
      filters:       { rate_type, currency, active_only },
      pricing_stats: pricingStats,
      data:          pricingRows,
    });

  } catch (error) {
    console.error('[MIS] getHarvesterPricingOverview error:', error);
    return res.status(500).send({ message: error.message || 'Error generating pricing overview report.' });
  }
};


// ===========================================================================
// REPORT 10 — Notification Delivery Report
//
// GET /api/mis/operations/notifications
//
// Query params:
//   start_date   {ISO date}              required
//   end_date     {ISO date}              required
//   channel      {SMS|EMAIL|PUSH}        optional
//   status       {PENDING|SENT|FAILED}   optional
// ===========================================================================
exports.getNotificationDelivery = async (req, res) => {
  try {
    const { start_date, end_date, channel, status } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).send({ message: 'start_date and end_date are required.' });
    }

    if (channel) validateEnum(channel, VALID_CHANNELS, 'channel');
    if (status)  validateEnum(status,  VALID_NOTIF_STATUSES, 'status');

    const conditions   = [`n.created_at BETWEEN :start_date AND :end_date`];
    const replacements = { start_date, end_date };

    if (channel) {
      conditions.push(`n.channel = :channel`);
      replacements.channel = channel;
    }
    if (status) {
      conditions.push(`n.status = :status`);
      replacements.status = status;
    }

    const whereClause = conditions.join(' AND ');

    // Channel × status breakdown
    const breakdownRows = await db.sequelize.query(
      `SELECT
          n.channel,
          n.status,
          COUNT(*)                                              AS count,
          ROUND(
            COUNT(*) * 100.0 /
            NULLIF(SUM(COUNT(*)) OVER (PARTITION BY n.channel), 0), 2
          )                                                     AS pct_within_channel,
          ROUND(
            COUNT(*) * 100.0 /
            NULLIF(SUM(COUNT(*)) OVER (), 0), 2
          )                                                     AS pct_of_total
       FROM public."Notifications" n
       WHERE ${whereClause}
       GROUP BY n.channel, n.status
       ORDER BY n.channel ASC, n.status ASC`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Overall summary
    const [summary] = await db.sequelize.query(
      `SELECT
          COUNT(*)                                                            AS total_notifications,
          COUNT(*) FILTER (WHERE n.status = 'SENT')                         AS total_sent,
          COUNT(*) FILTER (WHERE n.status = 'FAILED')                       AS total_failed,
          COUNT(*) FILTER (WHERE n.status = 'PENDING')                      AS total_pending,
          ROUND(
            COUNT(*) FILTER (WHERE n.status = 'SENT') * 100.0 /
            NULLIF(COUNT(*), 0), 2
          )                                                                   AS overall_delivery_rate,
          COUNT(DISTINCT n.booking_id)                                        AS unique_bookings_notified
       FROM public."Notifications" n
       WHERE ${whereClause}`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Per-channel delivery rate summary
    const channelSummary = await db.sequelize.query(
      `SELECT
          n.channel,
          COUNT(*)                                              AS total,
          COUNT(*) FILTER (WHERE n.status = 'SENT')           AS sent,
          COUNT(*) FILTER (WHERE n.status = 'FAILED')         AS failed,
          COUNT(*) FILTER (WHERE n.status = 'PENDING')        AS pending,
          ROUND(
            COUNT(*) FILTER (WHERE n.status = 'SENT') * 100.0 /
            NULLIF(COUNT(*), 0), 2
          )                                                     AS delivery_rate
       FROM public."Notifications" n
       WHERE ${whereClause}
       GROUP BY n.channel
       ORDER BY n.channel ASC`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).send({
      report:          'notification_delivery',
      filters:         { start_date, end_date, channel, status },
      summary,
      channel_summary: channelSummary,
      data:            breakdownRows,
    });

  } catch (error) {
    console.error('[MIS] getNotificationDelivery error:', error);
    return res.status(500).send({ message: error.message || 'Error generating notification delivery report.' });
  }
};


// ===========================================================================
// REPORT 11 — Field Registration Growth
//
// GET /api/mis/operations/field-growth
//
// Query params:
//   start_date   {ISO date}                        required
//   end_date     {ISO date}                        required
//   period       {day|week|month|quarter|year}      default: month
//   farmer_id    {uuid}                             optional
//   city         {string}                           optional
// ===========================================================================
exports.getFieldRegistrationGrowth = async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      period    = 'month',
      farmer_id,
      city,
    } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).send({ message: 'start_date and end_date are required.' });
    }

    const safePeriod = validatePeriod(period);
    const conditions   = [`f.created_at BETWEEN :start_date AND :end_date`];
    const replacements = { start_date, end_date };

    if (farmer_id) {
      conditions.push(`f.farmer_id = :farmer_id`);
      replacements.farmer_id = farmer_id;
    }
    if (city) {
      conditions.push(`LOWER(up.city) = LOWER(:city)`);
      replacements.city = city;
    }

    const whereClause = conditions.join(' AND ');

    // Period × city breakdown
    const periodRows = await db.sequelize.query(
      `SELECT
          DATE_TRUNC('${safePeriod}', f.created_at) AS period,
          up.city,
          COUNT(f.field_id)                          AS new_fields,
          ROUND(SUM(f.calculated_area_acres), 4)     AS total_acres,
          ROUND(AVG(f.calculated_area_acres), 4)     AS avg_field_size_acres,
          COUNT(DISTINCT f.farmer_id)                AS unique_farmers
       FROM public."Fields"       f
       JOIN public."UserProfiles" up ON up.user_id = f.farmer_id
       WHERE ${whereClause}
       GROUP BY 1, up.city
       ORDER BY 1 ASC, up.city ASC`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Overall summary
    const [summary] = await db.sequelize.query(
      `SELECT
          COUNT(f.field_id)                           AS total_fields_registered,
          ROUND(SUM(f.calculated_area_acres), 4)      AS total_acres_registered,
          ROUND(AVG(f.calculated_area_acres), 4)      AS avg_field_size_acres,
          MIN(f.calculated_area_acres)                AS smallest_field_acres,
          MAX(f.calculated_area_acres)                AS largest_field_acres,
          COUNT(DISTINCT f.farmer_id)                 AS unique_farmers,
          COUNT(DISTINCT up.city)                     AS unique_cities
       FROM public."Fields"       f
       JOIN public."UserProfiles" up ON up.user_id = f.farmer_id
       WHERE ${whereClause}`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Top cities by total registered acreage
    const topCities = await db.sequelize.query(
      `SELECT
          up.city,
          COUNT(f.field_id)                       AS field_count,
          ROUND(SUM(f.calculated_area_acres), 4)  AS total_acres,
          COUNT(DISTINCT f.farmer_id)             AS unique_farmers
       FROM public."Fields"       f
       JOIN public."UserProfiles" up ON up.user_id = f.farmer_id
       WHERE ${whereClause}
       GROUP BY up.city
       ORDER BY total_acres DESC NULLS LAST
       LIMIT 10`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).send({
      report:      'field_registration_growth',
      period_used: safePeriod,
      filters:     { start_date, end_date, farmer_id, city },
      summary,
      top_cities:  topCities,
      data:        periodRows,
    });

  } catch (error) {
    console.error('[MIS] getFieldRegistrationGrowth error:', error);
    return res.status(500).send({ message: error.message || 'Error generating field registration growth report.' });
  }
};


// ===========================================================================
// REPORT 12 — Active Session Audit
//
// GET /api/mis/operations/sessions
//
// Query params (all optional — reflects current live state):
//   role                  {FARMER|HARVESTER_OWNER|ADMIN}   optional
//   expiring_within_hours {number}                          default: 24
// ===========================================================================
exports.getActiveSessionAudit = async (req, res) => {
  try {
    const { role } = req.query;

    if (role) validateEnum(role, VALID_ROLES, 'role');

    const expiringWithinHours = Math.max(
      1, Math.min(168, parseInt(req.query.expiring_within_hours) || 24)
    ); // clamp between 1 h and 7 days

    const conditions   = [`rt.expires_at > NOW()`];
    const replacements = { expiring_within_hours: expiringWithinHours };

    if (role) {
      conditions.push(`u.role = :role`);
      replacements.role = role;
    }

    const whereClause = conditions.join(' AND ');

    // Sessions by role
    const byRole = await db.sequelize.query(
      `SELECT
          u.role,
          COUNT(rt.token_id)                                        AS active_sessions,
          COUNT(rt.token_id)
            FILTER (
              WHERE rt.expires_at < NOW() + (:expiring_within_hours || ' hours')::interval
            )                                                        AS expiring_soon,
          MIN(rt.expires_at)                                         AS earliest_expiry,
          MAX(rt.expires_at)                                         AS latest_expiry
       FROM public."RefreshTokens" rt
       JOIN public."Users"         u ON u.user_id = rt.user_id
       WHERE ${whereClause}
       GROUP BY u.role
       ORDER BY active_sessions DESC`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Platform-wide session totals
    const [sessionTotals] = await db.sequelize.query(
      `SELECT
          COUNT(rt.token_id)                                        AS total_active_sessions,
          COUNT(rt.token_id)
            FILTER (
              WHERE rt.expires_at < NOW() + (:expiring_within_hours || ' hours')::interval
            )                                                        AS expiring_soon,
          COUNT(DISTINCT rt.user_id)                                AS unique_users_online
       FROM public."RefreshTokens" rt
       JOIN public."Users"         u ON u.user_id = rt.user_id
       WHERE ${whereClause}`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Most recently issued tokens (latest 20 — useful for anomaly detection)
    const recentTokens = await db.sequelize.query(
      `SELECT
          rt.token_id,
          rt.created_at   AS issued_at,
          rt.expires_at,
          u.role,
          u.email,
          up.first_name || ' ' || up.last_name AS user_name
       FROM public."RefreshTokens" rt
       JOIN public."Users"         u  ON u.user_id  = rt.user_id
       JOIN public."UserProfiles"  up ON up.user_id = rt.user_id
       WHERE ${whereClause}
       ORDER BY rt.created_at DESC
       LIMIT 20`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).send({
      report:                 'active_session_audit',
      as_of:                  new Date().toISOString(),
      filters:                { role, expiring_within_hours: expiringWithinHours },
      session_totals:         sessionTotals,
      by_role:                byRole,
      recent_tokens:          recentTokens,
    });

  } catch (error) {
    console.error('[MIS] getActiveSessionAudit error:', error);
    return res.status(500).send({ message: error.message || 'Error generating active session audit.' });
  }
};


