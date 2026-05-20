// controllers/pricing.controller.js

const { HarvesterPricing, Harvester, HarvesterAvailability, sequelize } = require('../models');
const { Op } = require('sequelize');

// ─── Helper: activate harvester if it has both pricing and availability ────────
// Called after any pricing state change (create, activate, deactivate)
// so the harvester's is_active flag always reflects the true state.
const syncHarvesterActiveState = async (harvesterId, transaction) => {
  const hasPricing = await HarvesterPricing.count({
    where: {
      harvester_id: harvesterId,
      is_active:    true,
    },
    transaction,
  });

  const hasAvailability = await HarvesterAvailability.count({
    where: {
      harvester_id: harvesterId,
      active:       true,
    },
    transaction,
  });

  // Harvester is only active when BOTH conditions are met
  const shouldBeActive = hasPricing > 0 && hasAvailability > 0;

  await Harvester.update(
    { is_active: shouldBeActive },
    {
      where: { harvester_id: harvesterId },
      transaction,
    }
  );

  return shouldBeActive;
};

// ─── GET /pricing/:harvesterId ────────────────────────────────────────────────
// Returns all pricing records for a harvester, ordered by rate type then created date
exports.getPricings = async (req, res) => {
  try {
    const { harvesterId } = req.params;

    const harvester = await Harvester.findByPk(harvesterId);
    if (!harvester) {
      return res.status(404).json({ message: 'Harvester not found.' });
    }

    const pricings = await HarvesterPricing.findAll({
      where:  { harvester_id: harvesterId },
      order:  [
        ['rate_type',  'ASC'],
        ['is_active',  'DESC'], // active ones first within each type
        ['created_at', 'DESC'],
      ],
    });

    return res.status(200).json(pricings);

  } catch (error) {
    console.error('[getPricings]', error);
    return res.status(500).json({
      message: error.message || 'Failed to load pricing.',
    });
  }
};

// ─── GET /pricing/:harvesterId/:pricingId ─────────────────────────────────────
// Returns a single pricing record (used to pre-fill the edit form)
exports.getPricing = async (req, res) => {
  try {
    const { harvesterId, pricingId } = req.params;

    const pricing = await HarvesterPricing.findOne({
      where: {
        pricing_id:   pricingId,
        harvester_id: harvesterId,
      },
    });

    if (!pricing) {
      return res.status(404).json({ message: 'Pricing not found.' });
    }

    return res.status(200).json(pricing);

  } catch (error) {
    console.error('[getPricing]', error);
    return res.status(500).json({
      message: error.message || 'Failed to load pricing.',
    });
  }
};

// ─── POST /pricing/:harvesterId ───────────────────────────────────────────────
// Creates a new pricing record. New pricings start as inactive.
exports.createPricing = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { harvesterId } = req.params;
    const { pricing_name, rate_type, price_per_unit, currency } = req.body;

    // ── Validation ──────────────────────────────────────────────────────────
    if (!rate_type) {
      await t.rollback();
      return res.status(400).json({ message: 'rate_type is required.' });
    }
    if (!['PER_AREA', 'PER_HOUR'].includes(rate_type)) {
      await t.rollback();
      return res.status(400).json({
        message: "rate_type must be 'PER_AREA' or 'PER_HOUR'.",
      });
    }
    if (!price_per_unit || isNaN(parseFloat(price_per_unit)) || parseFloat(price_per_unit) <= 0) {
      await t.rollback();
      return res.status(400).json({
        message: 'price_per_unit must be a positive number.',
      });
    }

    const harvester = await Harvester.findByPk(harvesterId, { transaction: t });
    if (!harvester) {
      await t.rollback();
      return res.status(404).json({ message: 'Harvester not found.' });
    }

    // New pricings are always created as inactive —
    // the owner must explicitly activate from the list.
    const pricing = await HarvesterPricing.create({
      harvester_id:   harvesterId,
      pricing_name:   pricing_name?.trim() || null,
      rate_type,
      price_per_unit: parseFloat(price_per_unit),
      currency:       currency || 'LKR',
      is_active:      false,
    }, { transaction: t });

    await t.commit();
    return res.status(201).json(pricing);

  } catch (error) {
    await t.rollback();
    console.error('[createPricing]', error);
    return res.status(500).json({
      message: error.message || 'Failed to create pricing.',
    });
  }
};

// ─── PUT /pricing/:harvesterId/:pricingId ─────────────────────────────────────
// Updates an existing pricing record.
// Active state is NOT changed here — use activate/deactivate endpoints instead.
exports.updatePricing = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { harvesterId, pricingId } = req.params;
    const { pricing_name, rate_type, price_per_unit, currency } = req.body;

    const pricing = await HarvesterPricing.findOne({
      where: {
        pricing_id:   pricingId,
        harvester_id: harvesterId,
      },
      transaction: t,
    });

    if (!pricing) {
      await t.rollback();
      return res.status(404).json({ message: 'Pricing not found.' });
    }

    // ── Validation ──────────────────────────────────────────────────────────
    if (rate_type && !['PER_AREA', 'PER_HOUR'].includes(rate_type)) {
      await t.rollback();
      return res.status(400).json({
        message: "rate_type must be 'PER_AREA' or 'PER_HOUR'.",
      });
    }
    if (
      price_per_unit !== undefined &&
      (isNaN(parseFloat(price_per_unit)) || parseFloat(price_per_unit) <= 0)
    ) {
      await t.rollback();
      return res.status(400).json({
        message: 'price_per_unit must be a positive number.',
      });
    }

    // Only update fields that were actually sent
    const updates = {};
    if (pricing_name  !== undefined) updates.pricing_name   = pricing_name?.trim() || null;
    if (rate_type     !== undefined) updates.rate_type      = rate_type;
    if (price_per_unit !== undefined) updates.price_per_unit = parseFloat(price_per_unit);
    if (currency      !== undefined) updates.currency       = currency;

    await pricing.update(updates, { transaction: t });

    await t.commit();
    return res.status(200).json(pricing);

  } catch (error) {
    await t.rollback();
    console.error('[updatePricing]', error);
    return res.status(500).json({
      message: error.message || 'Failed to update pricing.',
    });
  }
};

// ─── PATCH /pricing/:harvesterId/:pricingId/activate ─────────────────────────
// Activates a pricing and deactivates all other pricings of the same rate_type.
// Then syncs the harvester's is_active state.
exports.activatePricing = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { harvesterId, pricingId } = req.params;

    const pricing = await HarvesterPricing.findOne({
      where: {
        pricing_id:   pricingId,
        harvester_id: harvesterId,
      },
      transaction: t,
    });

    if (!pricing) {
      await t.rollback();
      return res.status(404).json({ message: 'Pricing not found.' });
    }

    if (pricing.is_active) {
      await t.rollback();
      return res.status(400).json({ message: 'Pricing is already active.' });
    }

    // Find which pricings of the same type will be deactivated
    // (returned in the response so the frontend can show a meaningful message)
    const previouslyActive = await HarvesterPricing.findAll({
      where: {
        harvester_id: harvesterId,
        rate_type:    pricing.rate_type,
        is_active:    true,
        pricing_id:   { [Op.ne]: pricingId },
      },
      transaction: t,
    });

    // Deactivate all others of the same rate_type for this harvester
    await HarvesterPricing.update(
      { is_active: false },
      {
        where: {
          harvester_id: harvesterId,
          rate_type:    pricing.rate_type,
          pricing_id:   { [Op.ne]: pricingId },
        },
        transaction: t,
      }
    );

    // Activate the target pricing
    await pricing.update({ is_active: true }, { transaction: t });

    // Sync the harvester's is_active flag based on pricing + availability state
    const harvesterNowActive = await syncHarvesterActiveState(harvesterId, t);

    await t.commit();

    return res.status(200).json({
      message:              'Pricing activated successfully.',
      pricing,
      deactivated_count:    previouslyActive.length,
      deactivated:          previouslyActive.map((p) => ({
        pricing_id:   p.pricing_id,
        pricing_name: p.pricing_name,
        rate_type:    p.rate_type,
      })),
      harvester_now_active: harvesterNowActive,
    });

  } catch (error) {
    await t.rollback();
    console.error('[activatePricing]', error);
    return res.status(500).json({
      message: error.message || 'Failed to activate pricing.',
    });
  }
};

// ─── PATCH /pricing/:harvesterId/:pricingId/deactivate ────────────────────────
// Deactivates a single pricing and syncs the harvester's is_active state.
exports.deactivatePricing = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { harvesterId, pricingId } = req.params;

    const pricing = await HarvesterPricing.findOne({
      where: {
        pricing_id:   pricingId,
        harvester_id: harvesterId,
      },
      transaction: t,
    });

    if (!pricing) {
      await t.rollback();
      return res.status(404).json({ message: 'Pricing not found.' });
    }

    if (!pricing.is_active) {
      await t.rollback();
      return res.status(400).json({ message: 'Pricing is already inactive.' });
    }

    await pricing.update({ is_active: false }, { transaction: t });

    // Deactivating a pricing may make the harvester inactive
    // if there is no longer any active pricing for any rate_type
    const harvesterNowActive = await syncHarvesterActiveState(harvesterId, t);

    await t.commit();

    return res.status(200).json({
      message:              'Pricing deactivated.',
      pricing,
      harvester_now_active: harvesterNowActive,
    });

  } catch (error) {
    await t.rollback();
    console.error('[deactivatePricing]', error);
    return res.status(500).json({
      message: error.message || 'Failed to deactivate pricing.',
    });
  }
};

// ─── DELETE /pricing/:harvesterId/:pricingId ──────────────────────────────────
// Deletes a pricing. Active pricings cannot be deleted —
// the owner must deactivate first.
exports.deletePricing = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { harvesterId, pricingId } = req.params;

    const pricing = await HarvesterPricing.findOne({
      where: {
        pricing_id:   pricingId,
        harvester_id: harvesterId,
      },
      transaction: t,
    });

    if (!pricing) {
      await t.rollback();
      return res.status(404).json({ message: 'Pricing not found.' });
    }

    // Guard: prevent deleting an active pricing
    if (pricing.is_active) {
      await t.rollback();
      return res.status(400).json({
        message: 'Cannot delete an active pricing. Deactivate it first.',
      });
    }

    await pricing.destroy({ transaction: t });

    await t.commit();
    return res.status(204).send();

  } catch (error) {
    await t.rollback();
    console.error('[deletePricing]', error);
    return res.status(500).json({
      message: error.message || 'Failed to delete pricing.',
    });
  }
};