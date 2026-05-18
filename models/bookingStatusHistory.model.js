module.exports = (sequelize, DataTypes) => {
  const BookingStatusHistory = sequelize.define('BookingStatusHistory', {
    history_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    booking_id: {
      type: DataTypes.UUID,
      allowNull: false
      // Foreign key association to Bookings.booking_id
    },
    status: {
      type: DataTypes.ENUM(
        'REQUESTED',
        'CONFIRMED',
        'REJECTED',
        'CANCELLED_BY_FARMER',
        'CANCELLED_BY_OWNER',
        'IN_PROGRESS',
        'COMPLETED'
      ),
      allowNull: false
    },
    changed_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
      notes: {
      type: DataTypes.STRING,
      allowNull: true,
    }
  }, {
    tableName: 'BookingStatusHistory',
    timestamps: true,
    createdAt: 'change_time', // Maps createdAt to the 'change_time' column
    updatedAt: false // This table is append-only
  });

  return BookingStatusHistory;
};