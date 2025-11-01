module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define('Notification', {
    notification_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false // The user to be notified
      // Foreign key association to Users.user_id
    },
    booking_id: {
      type: DataTypes.UUID,
      allowNull: true // Optional, for context
      // Foreign key association to Bookings.booking_id
    },
    channel: {
      type: DataTypes.ENUM('SMS', 'EMAIL', 'WHATSAPP'),
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'SENT', 'FAILED'),
      allowNull: false,
      defaultValue: 'PENDING'
    }
  }, {
    tableName: 'Notifications',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return Notification;
};