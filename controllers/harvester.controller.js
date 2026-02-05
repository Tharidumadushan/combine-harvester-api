const db = require('../models');
const Harvester = db.Harvester;
const HarvesterPricing = db.HarvesterPricing;
const HarvesterAvailability = db.HarvesterAvailability;

exports.createHarvester = async (req, res) => {
  try {
    const ownerId = req.userId; // From auth middleware
    const { pricing_id, model_name, description, capacity } = req.body;

    const harvester = await Harvester.create({
      pricing_id,
      owner_id: ownerId,
      model_name,
      description,
      capacity
    });

    res.status(201).send(harvester);
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error creating harvester.' });
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


// exports.addAvailabilitySlot = async (req, res) => {
//   try {
//     const ownerId = req.userId; 
//     const { harvesterId } = req.params;
//     const { availability_id,availability_range } = req.body;

//     // Verify ownership
//     const harvester = await Harvester.findByPk(harvesterId);
//     if (!harvester) {
//       return res.status(404).send({ message: 'Harvester not found.' });
//     }
//     if (harvester.owner_id !== ownerId) {
//       return res.status(403).send({ message: 'Forbidden: You do not own this harvester.' });
//     }

//     const availability = await HarvesterAvailability.upsert({
//       availability_id: availability_id,
//       harvester_id: harvesterId,
//       availability_range: availability_range
//     });

//     res.status(201).send(availability);
//   } catch (error) {
//     res.status(500).send({ message: error.message || 'Error adding availability.' });
//   }
// };

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

exports.updateHarvester = async (req, res) => {
  try {

    const ownerId = req.userId; // From auth middleware
    const { harvester_id, is_active, model_name, description, capacity } = req.body;
    if (!harvester_id) {
      return res.status(400).send({ message: "Harvester ID is required." });
    }

    const [updatedRows] = await Harvester.update(
      {
        model_name,
        description,
        capacity,
        is_active
      },
      {
        where: {
          harvester_id: harvester_id
        }
      }
    );

    if (updatedRows === 0) {
      return res.status(404).send({ message: "Harvester not found or not authorized." });
    }

    res.send({ message: "Harvester updated successfully." });
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error Updating details.' });
  }
}
