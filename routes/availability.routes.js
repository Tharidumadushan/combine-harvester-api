const express = require('express');
const router = express.Router();

const availabilityController = require('../controllers/availability.controller')
const { verifyToken } = require('../middleware/auth.middleware');

router.get('/:harvesterId', availabilityController.getSlots);

router.post  ("/bulk/:harvesterId",    availabilityController.createBulkSlots);
router.patch ("/:harvesterId/:slotId", availabilityController.toggleSlot);
router.delete("/:harvesterId/:slotId", availabilityController.deleteSlot);

module.exports = router;