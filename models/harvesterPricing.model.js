module.exports = (sequelize, DataTypes) => {
  const HarvesterPricing = sequelize.define('HarvesterPricing', {
    pricing_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    harvester_id: {
      type: DataTypes.UUID,
      allowNull: false
      // Foreign key association to Harvesters.harvester_id
    },
    rate_type: {
      type: DataTypes.ENUM('PER_AREA', 'PER_HOUR'),
      allowNull: false
    },
    price_per_unit: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'LKR'
    },
      pricing_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false, // new pricings start inactive
    },
  }, {
    tableName: 'HarvesterPricing',
    timestamps: false, // No timestamps on this table per our schema
    //indexes: 
  }

  );

  return HarvesterPricing;
};