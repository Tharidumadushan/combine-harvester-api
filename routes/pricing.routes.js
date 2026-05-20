const express = require('express');
const router  = express.Router();
const pricingController = require('../controllers/pricing.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// router.get   ('/:harvesterId', verifyToken, pricingController.getPricings);
// router.get   ('/:harvesterId/:pricingId', verifyToken, pricingController.getPricing);
// router.post  ('/:harvesterId', verifyToken, pricingController.createPricing);
// router.put   ('/:harvesterId/:pricingId', verifyToken, pricingController.updatePricing);
// router.patch ('/:harvesterId/:pricingId/activate', verifyToken, pricingController.activatePricing);
// router.patch ('/:harvesterId/:pricingId/deactivate', verifyToken, pricingController.deactivatePricing);
// router.delete('/:harvesterId/:pricingId', verifyToken, pricingController.deletePricing);

router.get   ('/:harvesterId',  pricingController.getPricings);
router.get   ('/:harvesterId/:pricingId',  pricingController.getPricing);
router.post  ('/:harvesterId',  pricingController.createPricing);
router.put   ('/:harvesterId/:pricingId',  pricingController.updatePricing);
router.patch ('/:harvesterId/:pricingId/activate',  pricingController.activatePricing);
router.patch ('/:harvesterId/:pricingId/deactivate',  pricingController.deactivatePricing);
router.delete('/:harvesterId/:pricingId',  pricingController.deletePricing);

module.exports = router;