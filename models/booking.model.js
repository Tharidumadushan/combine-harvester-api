module.exports = (sequelize, DataTypes) => {
  const Booking = sequelize.define('Booking', {
    booking_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    farmer_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    harvester_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    field_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    pricing_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    availability_id:{
      type: DataTypes.UUID,
      allowNull: false
    },
    booking_time_range: {
      type: DataTypes.RANGE(DataTypes.DATE),
      allowNull: false
    },
    booking_status: {
      type: DataTypes.ENUM(
        'REQUESTED',
        'CONFIRMED',
        'REJECTED',
        'CANCELLED_BY_FARMER',
        'CANCELLED_BY_OWNER',
        'IN_PROGRESS',
        'COMPLETED'
      ),
      allowNull: false,
      defaultValue: 'REQUESTED'
    },
    calculated_cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    }
  }, {
    tableName: 'Bookings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
    // The critical 'no_double_bookings' EXCLUDE constraint
    // must be added manually via a Sequelize migration,
    // as it's a native PostgreSQL feature.
  });

  return Booking;
};