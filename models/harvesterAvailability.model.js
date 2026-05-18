module.exports = (sequelize, DataTypes) => {
  const HarvesterAvailability = sequelize.define('HarvesterAvailability', {
    availability_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    harvester_id: {
      type: DataTypes.UUID,
      allowNull: false
      // Foreign key association to Harvesters.harvester_id
    },
    availability_range: {
      // This maps to PostgreSQL's 'tsrange' data type.
      // It's an array with two dates:
      type: DataTypes.RANGE(DataTypes.DATE),
      allowNull: false
    },
    active:{
      type:Boolean
    }
  }, {
    tableName: 'HarvesterAvailability',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  return HarvesterAvailability;
};