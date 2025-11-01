module.exports = (sequelize, DataTypes) => {
  const Field = sequelize.define('Field', {
    field_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    farmer_id: {
      type: DataTypes.UUID,
      allowNull: false
      // Foreign key association to Users.user_id
    },
    field_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    field_polygon: {
      // This requires the PostGIS extension in your database.
      // 4326 is the standard SRID for GPS (WGS 84).
      type: DataTypes.GEOMETRY('POLYGON', 4326),
      allowNull: false
    },
    calculated_area_acres: {
      // This area is pre-calculated and stored for fast price lookups 
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false
    }
  }, {
    tableName: 'Fields',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return Field;
};