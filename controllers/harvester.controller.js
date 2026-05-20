const db = require('../models');
const { sequelize, Sequelize } = require("../models");
const Harvester = db.Harvester;
const HarvesterPricing = db.HarvesterPricing;
const HarvesterAvailability = db.HarvesterAvailability;


// ── Sanitise helper — converts "" → null for numeric DB columns ──────────────
// PostgreSQL rejects empty strings for INTEGER and DECIMAL fields.
// Call this on every optional numeric value before writing to the DB.
const toInt = (v) => (v === "" || v === null || v === undefined) ? null : parseInt(v, 10);
const toDecimal = (v) => (v === "" || v === null || v === undefined) ? null : parseFloat(v);
const toStr = (v) => (v === "" || v === null || v === undefined) ? null : String(v).trim();

exports.createHarvester = async (req, res) => {
  try {
    const ownerId = req.userId;

    const {
      harvester_name, model_name, brand, description, is_active,
      manufacture_year, contact_number,
      engine_hp, fuel_type, acres_per_hour, capacity,
      header_width_feet, grain_tank_capacity_liters,
      machine_weight_kg, engine_working_hours,
      supported_crops, terrain_type,
      transport_available, operator_included,
      current_district, service_radius_km,
      home_location, current_location, live_tracking_enabled,
    } = req.body;

    // ── Required field validation ─────────────────────────────────────────
    const missing = [];
    if (!harvester_name) missing.push("harvester_name");
    if (!model_name) missing.push("model_name");
    if (!brand) missing.push("brand");
    if (!acres_per_hour) missing.push("acres_per_hour");
    if (!current_district) missing.push("current_district");
    if (!supported_crops?.length) missing.push("supported_crops");

    if (missing.length) {
      return res.status(400).json({
        message: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    // ── Geography helper ──────────────────────────────────────────────────
    const toPoint = (coords) => {
      if (!coords?.lat || !coords?.lng) return null;
      return Sequelize.fn(
        "ST_SetSRID",
        Sequelize.fn("ST_MakePoint", coords.lng, coords.lat),
        4326
      );
    };

    const harvester = await Harvester.create({
      owner_id: ownerId,

      // Basic info — strings are safe, still sanitise for empty
      harvester_name: toStr(harvester_name),
      model_name: toStr(model_name),
      brand: toStr(brand),
      description: toStr(description),
      is_active: false,
      manufacture_year: toInt(manufacture_year),     // ← was crashing with ""
      contact_number: toStr(contact_number),

      // Specs — all numeric columns must go through toInt / toDecimal
      engine_hp: toInt(engine_hp),             // ← $8, the crash culprit
      fuel_type: toStr(fuel_type),
      acres_per_hour: toDecimal(acres_per_hour),
      capacity: toStr(capacity ?? acres_per_hour), // legacy STRING col
      header_width_feet: toDecimal(header_width_feet),  // ← would also crash
      grain_tank_capacity_liters: toDecimal(grain_tank_capacity_liters),
      machine_weight_kg: toDecimal(machine_weight_kg),
      engine_working_hours: toInt(engine_working_hours),

      // Operations
      supported_crops,
      terrain_type: toStr(terrain_type),
      transport_available: transport_available ?? false,
      operator_included: operator_included ?? true,

      // Location
      current_district: toStr(current_district),
      service_radius_km: toDecimal(service_radius_km),
      home_location: toPoint(home_location),
      current_location: toPoint(current_location),
      location_updated_at: current_location ? new Date() : null,
      live_tracking_enabled: live_tracking_enabled ?? false,

      // Stats always start at zero
      average_rating: 0,
      completed_jobs: 0,
    });

    return res.status(201).json(harvester);

  } catch (error) {
    console.error("[createHarvester]", error);
    return res.status(500).json({ message: error.message || "Error creating harvester." });
  }
};


exports.updateHarvester = async (req, res) => {
  try {
    const ownerId = req.userId;
    const harvesterId = req.params.harvesterId;

    const harvester = await Harvester.findOne({ where: { harvester_id: harvesterId } });

    if (!harvester) {
      return res.status(404).json({ message: "Harvester not found." });
    }
    if (harvester.owner_id !== ownerId && req.userRole !== 'SYSTEM_ADMIN') {
      return res.status(403).json({ message: "Not authorised to edit this harvester." });
    }

    const {
      harvester_name, model_name, brand, description, is_active,
      manufacture_year, contact_number,
      engine_hp, fuel_type, acres_per_hour, capacity,
      header_width_feet, grain_tank_capacity_liters,
      machine_weight_kg, engine_working_hours,
      supported_crops, terrain_type,
      transport_available, operator_included,
      current_district, service_radius_km,
      home_location, current_location, live_tracking_enabled,
    } = req.body;

    const toPoint = (coords) => {
      if (!coords?.lat || !coords?.lng) return null;
      return Sequelize.fn(
        "ST_SetSRID",
        Sequelize.fn("ST_MakePoint", coords.lng, coords.lat),
        4326
      );
    };

    // Build update payload — only include keys that were actually sent
    const updates = {};

    if (harvester_name !== undefined) updates.harvester_name = toStr(harvester_name);
    if (model_name !== undefined) updates.model_name = toStr(model_name);
    if (brand !== undefined) updates.brand = toStr(brand);
    if (description !== undefined) updates.description = toStr(description);
    if (is_active !== undefined) updates.is_active = is_active;
    if (manufacture_year !== undefined) updates.manufacture_year = toInt(manufacture_year);
    if (contact_number !== undefined) updates.contact_number = toStr(contact_number);

    if (engine_hp !== undefined) updates.engine_hp = toInt(engine_hp);
    if (fuel_type !== undefined) updates.fuel_type = toStr(fuel_type);
    if (acres_per_hour !== undefined) {
      updates.acres_per_hour = toDecimal(acres_per_hour);
      updates.capacity = String(acres_per_hour ?? ""); // legacy STRING col
    }
    if (capacity !== undefined) updates.capacity = toStr(capacity);
    if (header_width_feet !== undefined) updates.header_width_feet = toDecimal(header_width_feet);
    if (grain_tank_capacity_liters !== undefined) updates.grain_tank_capacity_liters = toDecimal(grain_tank_capacity_liters);
    if (machine_weight_kg !== undefined) updates.machine_weight_kg = toDecimal(machine_weight_kg);
    if (engine_working_hours !== undefined) updates.engine_working_hours = toInt(engine_working_hours);

    if (supported_crops !== undefined) updates.supported_crops = supported_crops;
    if (terrain_type !== undefined) updates.terrain_type = toStr(terrain_type);
    if (transport_available !== undefined) updates.transport_available = transport_available;
    if (operator_included !== undefined) updates.operator_included = operator_included;

    if (current_district !== undefined) updates.current_district = toStr(current_district);
    if (service_radius_km !== undefined) updates.service_radius_km = toDecimal(service_radius_km);
    if (live_tracking_enabled !== undefined) updates.live_tracking_enabled = live_tracking_enabled;

    if (home_location !== undefined) updates.home_location = toPoint(home_location);
    if (current_location !== undefined) {
      updates.current_location = toPoint(current_location);
      updates.location_updated_at = current_location ? new Date() : null;
    }

    await harvester.update(updates);

    const updated = await Harvester.findOne({ where: { harvester_id: harvesterId } });
    return res.status(200).json(updated);

  } catch (error) {
    console.error("[updateHarvester]", error);
    return res.status(500).json({ message: error.message || "Error updating harvester." });
  }
};

exports.listHarvesters = async (req, res) => {
  try {
    const harvesters = await Harvester.findAll({
      where: { is_active: true },
      include: [
        { model: HarvesterPricing },
        { model: HarvesterAvailability }
      ]
    });
    res.status(200).send(harvesters);
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error fetching harvesters.' });
  }
};

exports.myHarvesters = async (req, res) => {
  try {
    const farmerId = req.userId;
    const harvesters = await Harvester.findAll({
      where: {
        is_active: true,
        owner_id: farmerId
      },
      include: [
        { model: HarvesterPricing },
        { model: HarvesterAvailability }
      ]
    });
    res.status(200).send(harvesters);
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error fetching harvesters.' });
  }
};

// Pricing Rules .......................................

exports.addPricingRule = async (req, res) => {
  try {
    const ownerId = req.userId;
    const { harvesterId } = req.params;
    const { pricing_id, rate_type, price_per_unit, currency } = req.body; // rate_type is 'PER_AREA' or 'PER_HOUR' 

    // 1. Verify ownership
    const harvester = await Harvester.findByPk(harvesterId);
    if (!harvester) {
      return res.status(404).send({ message: 'Harvester not found.' });
    }
    if (harvester.owner_id !== ownerId) {
      return res.status(403).send({ message: 'Forbidden: You do not own this harvester.' });
    }

    // 2. Create or update the pricing rule (Upsert)
    const pricingRule = await HarvesterPricing.upsert({
      pricing_id: pricing_id,
      harvester_id: harvesterId,
      rate_type: rate_type,
      price_per_unit: price_per_unit,
      currency: currency
    });

    res.status(201).send(pricingRule);
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error adding pricing rule.' });
  }
};

exports.deletePricingRule = async (req, res) => {
  try {
    const ownerId = req.userId;
    const pricing_id = req.params.pricingid;

    const deletedRows = await HarvesterPricing.destroy({
      where: {
        pricing_id: pricing_id
      }
    });

    if (deletedRows === 0) {
      return res.status(404).send({ message: 'Pricing rule not found.' });
    }

    res.status(200).send({ message: 'Pricing rule deleted successfully.' });
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error deleting pricing rule.' });
  }
};


// Available Slots
const getLocalISOString = (date) => {
  const pad = (num) => String(num).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const diff = offset >= 0 ? '+' : '-';
  const offHours = pad(Math.floor(Math.abs(offset) / 60));
  const offMins = pad(Math.abs(offset) % 60);

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${diff}${offHours}:${offMins}`;
};

exports.addAvailabilitySlot = async (req, res) => {
  const t = await db.sequelize.transaction(); // Start transaction

  try {
    const ownerId = req.userId;
    const { harvesterId } = req.params;
    const {
      availability_id,
      availability_range,
      is_auto_split,
      split_hours,
      day_active_start,
      day_active_end
    } = req.body;

    // 1. Verify Ownership
    const harvester = await Harvester.findByPk(harvesterId);
    if (!harvester) {
      await t.rollback();
      return res.status(404).send({ message: 'Harvester not found.' });
    }
    if (harvester.owner_id !== ownerId) {
      await t.rollback();
      return res.status(403).send({ message: 'Forbidden: Ownership mismatch.' });
    }

    // --- CASE A: AUTOMATIC MULTIPLE SLOTS ---
    if (is_auto_split && !availability_id) {
      const startTotal = new Date(availability_range[0].value);
      const endTotal = new Date(availability_range[1].value);
      const createdSlots = [];

      // Loop through each day in the range
      // We use a copy of the date to avoid mutating the original range
      for (let d = new Date(startTotal); d <= endTotal; d.setDate(d.getDate() + 1)) {

        // 1. Get current day in YYYY-MM-DD format respecting local time
        const dayStr = d.toLocaleDateString('en-CA');

        // 2. Define active window for THIS specific day (Local Time)
        // We do NOT add 'Z' here so JS treats it as local system time
        let currentPointer = new Date(`${dayStr}T${day_active_start}:00`);
        const dayFinish = new Date(`${dayStr}T${day_active_end}:00`);

        // 3. Create chunks within the daily window
        const slotDurationMs = Number(split_hours) * 3600000;

        while (currentPointer.getTime() + slotDurationMs <= dayFinish.getTime()) {
          const slotEnd = new Date(currentPointer.getTime() + slotDurationMs);

          // 4. Ensure the slot doesn't exceed the overall 'endTotal' provided by user
          if (slotEnd <= endTotal) {
            createdSlots.push({
              harvester_id: harvesterId,
              availability_range: [
                { value: getLocalISOString(currentPointer), inclusive: true },
                { value: getLocalISOString(slotEnd), inclusive: false }
              ]
            });
          }

          // Move pointer to the start of the next slot
          currentPointer = new Date(slotEnd.getTime());
        }
      }

      // 5. Save all slots to the database
      const results = await HarvesterAvailability.bulkCreate(createdSlots, { transaction: t });
      await t.commit();
      return res.status(201).send(results);
    }

    // --- CASE B: SINGLE UPSERT (Standard Add or Edit) ---
    const availability = await HarvesterAvailability.upsert({
      availability_id: availability_id,
      harvester_id: harvesterId,
      availability_range: availability_range
    }, { transaction: t });

    await t.commit();
    res.status(201).send(availability);

  } catch (error) {
    await t.rollback();
    console.error("Availability Error:", error);
    res.status(500).send({ message: error.message || 'Error processing availability.' });
  }
};

exports.deleteAvailabilitySlot = async (req, res) => {
  try {
    const ownerId = req.userId;
    const { harvesterId, availabilityId } = req.params;

    // Verify ownership
    const harvester = await Harvester.findByPk(harvesterId);
    if (!harvester) {
      return res.status(404).send({ message: 'Harvester not found.' });
    }
    if (harvester.owner_id !== ownerId) {
      return res.status(403).send({ message: 'Forbidden: You do not own this harvester.' });
    }

    const deletedRows = await HarvesterAvailability.destroy({
      where: {
        availability_id: availabilityId
      }
    });

    if (deletedRows === 0) {
      return res.status(404).send({ message: 'Pricing rule not found.' });
    }

    res.status(200).send({ message: 'Pricing rule deleted successfully.' });
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error adding availability.' });
  }
}

exports.getHarvesterDetails = async (req, res) => {
  try {
    const id = req.params.harvesterId
    const harvester = await Harvester.findAll({
      where: { harvester_id: id },
      include: [
        { model: HarvesterPricing },
        { model: HarvesterAvailability }
      ]
    });
    res.status(200).send(harvester)

  } catch (error) {
    res.status(500).send({ message: error.message || 'Error getting details.' });
  }
}
