const db = require('../models');
const Field = db.Field;

/**
 * @route POST /api/fields
 * @description Create a new field (with GeoJSON polygon data).
 * @access Private (Farmer only)
 */
exports.createField = async (req, res) => {
  try {
    const farmerId = req.userId; // From auth middleware
    const { field_name, field_polygon, calculated_area_acres } = req.body;

    // field_polygon should be a valid GeoJSON Polygon object 
    // calculated_area_acres is the area calculated on the frontend (or backend) 
    
    if (!field_polygon ||!calculated_area_acres ||!field_name) {
      return res.status(400).send({ message: 'Missing required field data.' });
    }

    const field = await Field.create({
      farmer_id: farmerId,
      field_name,
      field_polygon, // Sequelize handles the GeoJSON object
      calculated_area_acres
    });

    res.status(201).send(field);
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error creating field.' });
  }
};

/**
 * @route GET /api/fields
 * @description Get all fields belonging to the logged-in farmer.
 * @access Private (Farmer only)
 */
exports.getMyFields = async (req, res) => {
  try {
    const farmerId = req.userId;
    const fields = await Field.findAll({
      where: { farmer_id: farmerId }
    });

    res.status(200).send(fields);
  } catch (error)
 {
    res.status(500).send({ message: error.message || 'Error fetching fields.' });
  }
};

//... other field management functions like getFieldById, updateField...