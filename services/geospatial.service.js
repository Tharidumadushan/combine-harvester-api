const db = require('../models');
const { Sequelize } = db;

/**
 * Calculates the area of a GeoJSON polygon using PostGIS.
 * PostGIS's ST_Area() returns area in square meters (for SRID 4326).
 * This function converts the result to acres.
 *
 * @param {object} geoJsonPolygon - A standard GeoJSON Polygon object.
 * @returns {Promise<number>} The area of the polygon in acres.
 * @throws Will throw an error if the calculation fails.
 */
exports.calculateAreaFromGeoJSON = async (geoJsonPolygon) => {
  if (!geoJsonPolygon || geoJsonPolygon.type!== 'Polygon') {
    throw new Error('Invalid GeoJSON: A Polygon object is required.');
  }
  
  // 1. Convert the GeoJSON object to a string for the SQL query
  const geoJsonString = JSON.stringify(geoJsonPolygon);

  // 2. Define the raw PostGIS query.
  // ST_GeomFromGeoJSON() creates a PostGIS geometry from the GeoJSON.
  // ST_SetSRID() ensures it's set to 4326 (standard GPS).
  // ST_Area() calculates the area. We use 'geography' type for meters.
  // 1 Acre = 4046.86 Square Meters
  const sql = `
    SELECT ST_Area(
      ST_SetSRID(ST_GeomFromGeoJSON(:polygon), 4326)::geography
    ) / 4046.86 AS area_in_acres;
  `;

  try {
    // 3. Execute the raw query using Sequelize
    const result = await db.sequelize.query(sql, {
      replacements: { polygon: geoJsonString },
      type: Sequelize.QueryTypes.SELECT
    });

    if (result && result.length > 0 && result.area_in_acres) {
      return parseFloat(result.area_in_acres);
    } else {
      throw new Error('PostGIS area calculation returned an invalid result.');
    }
  } catch (error) {
    console.error('PostGIS calculation failed:', error);
    throw new Error('Failed to calculate field area.');
  }
};