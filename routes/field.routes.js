const express = require('express');
const router = express.Router();

// --- middleware and controllers ---
const fieldController = require('../controllers/field.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { isFarmer } = require('../middleware/role.middleware');

// Apply auth and role middleware to all routes in this file
router.use(verifyToken, isFarmer);

// Route GET /api/fields || Get all fields belonging to the logged-in farmer. || access Private (Farmer only)
router.get('/', fieldController.getMyFields);

// Route POST /api/fields || Create a new field (with GeoJSON polygon data). || access Private (Farmer only)
router.post('/', fieldController.createField);

// Route GET /api/fields/:fieldId || description Get details for a single field. || access Private (Farmer only)
router.get('/:fieldId', fieldController.getFieldById);

//Route PUT /api/fields/:fieldId || description Update a field (e.g., new polygon or name). ||  @access Private (Farmer only)
router.put('/:fieldId', fieldController.updateField);
 
module.exports = router;