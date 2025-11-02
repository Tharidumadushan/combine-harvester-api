const express = require('express');
const router = express.Router();

// --- We will import middleware and controllers here ---
// const fieldController = require('../controllers/field.controller');
// const { verifyToken } = require('../middleware/auth.middleware');
// const { isFarmer } = require('../middleware/role.middleware');

// Apply auth and role middleware to all routes in this file
// router.use(verifyToken, isFarmer);

/**
 * @route POST /api/fields
 * @description Create a new field (with GeoJSON polygon data).
 * @access Private (Farmer only)
 */
// router.post('/', fieldController.createField);
router.post('/', (req, res) => {
  res.status(201).json({ message: 'Create new field' });
});

/**
 * @route GET /api/fields
 * @description Get all fields belonging to the logged-in farmer.
 * @access Private (Farmer only)
 */
// router.get('/', fieldController.getMyFields);
router.get('/', (req, res) => {
  res.status(200).json({ message: 'Get all my fields' });
});

/**
 * @route GET /api/fields/:fieldId
 * @description Get details for a single field.
 * @access Private (Farmer only)
 */
// router.get('/:fieldId', fieldController.getFieldById);
router.get('/:fieldId', (req, res) => {
  res.status(200).json({ message: `Get field ${req.params.fieldId}` });
});

/**
 * @route PUT /api/fields/:fieldId
 * @description Update a field (e.g., new polygon or name).
 * @access Private (Farmer only)
 */
// router.put('/:fieldId', fieldController.updateField);
router.put('/:fieldId', (req, res) => {
  res.status(200).json({ message: `Update field ${req.params.fieldId}` });
});

module.exports = router;