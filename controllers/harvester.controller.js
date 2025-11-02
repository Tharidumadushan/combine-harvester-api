const db = require('../models');
const Harvester = db.Harvester;
const HarvesterPricing = db.HarvesterPricing;
const HarvesterAvailability = db.HarvesterAvailability;

/**
 * @route POST /api/harvesters
 * @description Create a new harvester listing.
 * @access Private (Harvester Owner only)
 */
exports.createHarvester = async (req, res) => {
  try {
    const ownerId = req.userId; // From auth middleware
    const { model_name, description, capacity } = req.body;

    const harvester = await Harvester.create({
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

/**
 * @route GET /api/harvesters
 * @description Get a list of all available harvesters (for searching).
 * @access Public
 */
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

/**
 * @route POST /api/harvesters/:harvesterId/pricing
 * @description Add or update a pricing rule for a harvester.
 * @access Private (Owner only)
 */
exports.addPricingRule = async (req, res) => {
  try {
    const ownerId = req.userId;
    const { harvesterId } = req.params;
    const { rate_type, price_per_unit, currency } = req.body; // rate_type is 'PER_AREA' or 'PER_HOUR' 

    // 1. Verify ownership
    const harvester = await Harvester.findByPk(harvesterId);
    if (!harvester) {
      return res.status(404).send({ message: 'Harvester not found.' });
    }
    if (harvester.owner_id!== ownerId) {
      return res.status(403).send({ message: 'Forbidden: You do not own this harvester.' });
    }

    // 2. Create or update the pricing rule (Upsert)
    const pricingRule = await HarvesterPricing.upsert({
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

/**
 * @route POST /api/harvesters/:harvesterId/availability
 * @description Add an availability slot to a harvester.
 * @access Private (Owner only)
 */
exports.addAvailabilitySlot = async (req, res) => {
  try {
    const ownerId = req.userId;
    const { harvesterId } = req.params;
    const { start_time, end_time } = req.body;

    // 1. Verify ownership
    const harvester = await Harvester.findByPk(harvesterId);
    if (!harvester) {
      return res.status(404).send({ message: 'Harvester not found.' });
    }
    if (harvester.owner_id!== ownerId) {
      return res.status(403).send({ message: 'Forbidden: You do not own this harvester.' });
    }

    // 2. Create the availability slot
    // Sequelize RANGE type expects an array of two dates
    const availability_range = [new Date(start_time), new Date(end_time)];

    const availability = await HarvesterAvailability.create({
      harvester_id: harvesterId,
      availability_range: availability_range
    });

    res.status(201).send(availability);
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error adding availability.' });
  }
};

//... other harvester management functions like updateHarvester, getHarvesterDetails...