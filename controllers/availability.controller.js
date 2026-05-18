const db = require('../models');
const {sequelize, Sequelize } = require("../models");
const { Op }      = require("sequelize");
const Harvester = db.Harvester;
const HarvesterPricing = db.HarvesterPricing;
const HarvesterAvailability = db.HarvesterAvailability;
const Booking = db.Booking;


const getLocalISOString = (date) => {
    const pad = (num) => String(num).padStart(2, '0');
    const offset = -date.getTimezoneOffset();
    const diff = offset >= 0 ? '+' : '-';
    const offHours = pad(Math.floor(Math.abs(offset) / 60));
    const offMins = pad(Math.abs(offset) % 60);

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${diff}${offHours}:${offMins}`;
};

exports.getSlots = async (req, res) => {
  try {
    const slots = await HarvesterAvailability.findAll({
      where: { harvester_id: req.params.harvesterId },
      order: [["created_at", "DESC"]],
      include: [
        {
          model: Booking,
          as: "Booking",              // ← matches the alias in models/index.js
          required: false,
          attributes: [
            "booking_id",
            "booking_status",
            "calculated_cost",
            "booking_time_range",
            "farmer_id",
            "created_at",
          ],
          where: {
            booking_status: {
              [Op.notIn]: ["REJECTED", "CANCELLED_BY_FARMER", "CANCELLED_BY_OWNER"],
            },
          },
        },
      ],
    });

    return res.status(200).json(slots);

  } catch (error) {
    console.error("[getSlots]", error);
    return res.status(500).json({
      message: error.message || "Failed to load availability slots.",
    });
  }
};

exports.createBulkSlots = async (req, res) => {
  const { slots } = req.body;

  if (!Array.isArray(slots) || slots.length === 0) {
    return res.status(400).json({ message: "slots must be a non-empty array." });
  }

  const t = await sequelize.transaction();

  try {
    // ── Step 1: Validate all incoming slots ───────────────────────────────
    const validated = slots.map((s, i) => {
      if (!s.start || !s.end) {
        throw new Error(`Slot ${i + 1}: missing start or end value.`);
      }

      const startDate = new Date(s.start);
      const endDate   = new Date(s.end);

      if (isNaN(startDate.getTime())) {
        throw new Error(`Slot ${i + 1}: invalid start date "${s.start}".`);
      }
      if (isNaN(endDate.getTime())) {
        throw new Error(`Slot ${i + 1}: invalid end date "${s.end}".`);
      }
      if (startDate >= endDate) {
        throw new Error(`Slot ${i + 1}: start must be before end.`);
      }

      return {
        startISO: startDate.toISOString(),
        endISO:   endDate.toISOString(),
      };
    });

    const harvesterId = req.params.harvesterId;

    // ── Step 2: Check each slot for overlap with existing DB records ───────
    // PostgreSQL's && operator returns true if two tstzrange values overlap.
    // We run one query per incoming slot — acceptable for typical slot counts.
    const skipped = [];   // slots that conflict with existing records
    const toInsert = [];  // slots that are safe to insert

    for (const { startISO, endISO } of validated) {
      const rangeStr = `['${startISO}','${endISO}')`;

      const [conflicts] = await sequelize.query(
        `SELECT
           availability_id,
           lower(availability_range) AS conflict_start,
           upper(availability_range) AS conflict_end
         FROM "HarvesterAvailability"
         WHERE harvester_id = $1
           AND availability_range && $2::tstzrange
         LIMIT 1`,
        {
          bind: [harvesterId, rangeStr],
          transaction: t,
        }
      );

      if (conflicts.length > 0) {
        const existing = conflicts[0];

        // Format conflict dates into a readable message
        const conflictStart = new Date(existing.conflict_start)
          .toLocaleString("en-GB", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit", timeZone: "UTC",
          });
        const conflictEnd = new Date(existing.conflict_end)
          .toLocaleString("en-GB", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit", timeZone: "UTC",
          });
        const proposedStart = new Date(startISO)
          .toLocaleString("en-GB", {
            day: "2-digit", month: "short",
            hour: "2-digit", minute: "2-digit", timeZone: "UTC",
          });
        const proposedEnd = new Date(endISO)
          .toLocaleString("en-GB", {
            day: "2-digit", month: "short",
            hour: "2-digit", minute: "2-digit", timeZone: "UTC",
          });

        skipped.push({
          proposed_start: startISO,
          proposed_end:   endISO,
          reason: `Slot ${proposedStart} – ${proposedEnd} overlaps with an existing slot on ${conflictStart} – ${conflictEnd} (ID: ...${existing.availability_id.slice(-6)}).`,
        });
      } else {
        toInsert.push({ startISO, endISO });
      }
    }

    // ── Step 3: If nothing is safe to insert, abort early ─────────────────
    if (toInsert.length === 0) {
      await t.rollback();
      return res.status(409).json({
        message: "No slots were created — all proposed slots overlap with existing ones.",
        created_count: 0,
        skipped_count: skipped.length,
        skipped,
      });
    }

    // ── Step 4: Insert only the non-overlapping slots ─────────────────────
    const { v4: uuidv4 } = require("uuid");
    const now = new Date().toISOString();

    const valuePlaceholders = [];
    const bindings          = [];
    let   paramIndex        = 1;

    for (const { startISO, endISO } of toInsert) {
      const rangeStr = `['${startISO}','${endISO}')`;
      valuePlaceholders.push(
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}::tstzrange, $${paramIndex++})`
      );
      bindings.push(uuidv4(), harvesterId, rangeStr, now);
    }

    const sql = `
      INSERT INTO "HarvesterAvailability"
        ("availability_id", "harvester_id", "availability_range", "created_at")
      VALUES ${valuePlaceholders.join(", ")}
      RETURNING *
    `;

    const [created] = await sequelize.query(sql, {
      bind: bindings,
      transaction: t,
    });

    await t.commit();

    // ── Step 5: Return a detailed response ────────────────────────────────
    // Always tell the frontend exactly what happened:
    // how many were created, how many were skipped, and why.
    return res.status(skipped.length > 0 ? 207 : 201).json({
      message: skipped.length > 0
        ? `${created.length} slot${created.length !== 1 ? "s" : ""} created. ${skipped.length} slot${skipped.length !== 1 ? "s" : ""} skipped due to overlap.`
        : `${created.length} slot${created.length !== 1 ? "s" : ""} created successfully.`,
      created_count: created.length,
      skipped_count: skipped.length,
      created,
      skipped,
    });

  } catch (error) {
    await t.rollback();
    console.error("[createBulkSlots]", error);

    const isValidationError =
      error.message?.includes("missing start")  ||
      error.message?.includes("invalid start")  ||
      error.message?.includes("invalid end")    ||
      error.message?.includes("start must be before");

    return res.status(isValidationError ? 400 : 500).json({
      message: error.message || "Failed to create availability slots.",
    });
  }
};

exports.toggleSlot = async (req, res) => {
  try {
    const slot = await HarvesterAvailability.findByPk(req.params.slotId);

    if (!slot) {
      return res.status(404).json({ message: "Slot not found." });
    }

    if (slot.harvester_id !== req.params.harvesterId){
      return res.status(400).json({ message: "invalid Harvester" });
    }

    if (typeof req.body.active !== "boolean") {
      return res.status(400).json({ message: "'active' must be a boolean value." });
    }

    await slot.update({ active: req.body.active });

    return res.status(200).json(slot);

  } catch (error) {
    console.error("[toggleSlot]", error);
    return res.status(500).json({
      message: error.message || "Failed to update slot.",
    });
  }
};


exports.deleteSlot = async (req, res) => {
  try {
    const slot = await HarvesterAvailability.findByPk(req.params.slotId);

    if (!slot) {
      return res.status(404).json({ message: "Slot not found." });
    }

    await slot.destroy();

    return res.status(204).send();

  } catch (error) {
    console.error("[deleteSlot]", error);
    return res.status(500).json({
      message: error.message || "Failed to delete slot.",
    });
  }
};