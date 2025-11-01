module.exports = (sequelize, DataTypes) => {
  const UserProfile = sequelize.define('UserProfile', {
    user_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false
      // This field is both a Primary Key and a Foreign Key.
      // The association (1:1) will be defined in /models/index.js
    },
    first_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    last_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    business_name: {
      type: DataTypes.STRING,
      allowNull: true // Optional, mainly for HARVESTER_OWNER 
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'UserProfiles',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return UserProfile;
};