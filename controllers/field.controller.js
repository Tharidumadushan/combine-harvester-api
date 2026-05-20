const db = require('../models');
const Field = db.Field;


exports.createField = async (req, res) => {
  try {
    const farmerId = req.userId; // From auth middleware
    const { field_name, field_polygon, calculated_area_acres } = req.body;


    if (!field_polygon || !calculated_area_acres || !field_name) {
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

exports.getMyFields = async (req, res) => {
  try {
    const farmerId = req.userId;
    const userRole = req.userRole;
    let fields;

    if (userRole === 'FARMER') {
       fields = await Field.findAll({
        where: { farmer_id: farmerId }
      });
    }else{
       fields = await Field.findAll();
    }

    res.status(200).send(fields);
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error fetching fields.' });
  }
};

exports.getFieldById = async (req, res) => {
  try {
    const field_id = req.params.fieldId;
    const fields = await Field.findAll({
      where: { field_id: field_id }
    });
    res.status(200).send(fields);
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error fetching field.' });
  }
}

exports.updateField = async (req, res) => {

  try {
    const farmerId = req.userId;
    const { fieldId } = req.params;
    const {
      field_name,
      field_polygon,
      calculated_area_acres
    } = req.body;

    // ============================================
    // VALIDATION

    if (
      !field_name ||
      !field_polygon ||
      !calculated_area_acres
    ) {

      return res.status(400).send({
        success: false,
        message: 'Missing required field data.'
      });
    }

    // ============================================
    // FIND FIELD
    // IMPORTANT:
    // Ensure farmer can only edit OWN field
    // ============================================

    const field = await Field.findOne({
      where: {
        field_id: fieldId,
        farmer_id: farmerId
      }
    });
    if (!field) {
      return res.status(404).send({success: false,message: 'Field not found.'});
    }

    // ============================================
    // UPDATE FIELD
    // ============================================

    field.field_name = field_name;
    field.field_polygon = field_polygon;
    field.calculated_area_acres = calculated_area_acres;

    await field.save();
    return res.status(200).send({success: true,message: 'Field updated successfully.',data: field});
  } catch (error) {

    console.error('Update Field Error:', error);
    return res.status(500).send({success: false,message: error.message ||'Error updating field.'});
  }
};