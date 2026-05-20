const express = require('express');
const router = express.Router();

const harvesterController = require('../controllers/harvester.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { isHarvesterOwner } = require('../middleware/role.middleware');

router.use(verifyToken);

//route POST /api/harvesters || Create a new harvester listing. || Private (Harvester Owner only)
router.post('/',[isHarvesterOwner], harvesterController.createHarvester);

// @route GET /api/harvesters || description Get a list of all available harvesters (for searching). || access Public
router.get('/', harvesterController.listHarvesters);

router.get('/my',[isHarvesterOwner],harvesterController.myHarvesters);

//route GET /api/harvesters/:harvesterId || description Get details for a single harvester. || access Public
router.get('/:harvesterId', harvesterController.getHarvesterDetails);

//route PUT /api/harvesters/:harvesterId || description Update a harvester's details. || access Private (Owner of this harvester only)
router.put('/:harvesterId',[isHarvesterOwner], harvesterController.updateHarvester);

//#region  --- Routes for Pricing and Availability 

//POST /api/harvesters/:harvesterId/pricing || @description Add a pricing rule (per-hour/per-area) to a harvester. || @access Private (Owner of this harvester only)
router.post('/:harvesterId/pricing',[isHarvesterOwner], harvesterController.addPricingRule);


//POST /api/harvesters/:harvesterId/availability || @description Add an availability slot to a harvester.|| @access Private (Owner of this harvester only)
 router.post('/:harvesterId/availability',[isHarvesterOwner], harvesterController.addAvailabilitySlot);

 // DELETE 
 router.delete('/pricing/:pricingid',[isHarvesterOwner], harvesterController.deletePricingRule);

 router.delete('/:harvesterId/availability/:availabilityId',[isHarvesterOwner],harvesterController.deleteAvailabilitySlot);

 //#endregion

module.exports = router;