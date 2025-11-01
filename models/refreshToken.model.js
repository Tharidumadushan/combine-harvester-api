module.exports = (sequelize, DataTypes) => {
  const RefreshToken = sequelize.define('RefreshToken', {
    token_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false
      // Foreign key association to Users.user_id defined in /models/index.js
    },
    token_hash: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    expires_at: {
      type: DataTypes.DATE, // In Sequelize, TIMESTAMPTZ is mapped to DATE
      allowNull: false
    }
  }, {
    tableName: 'RefreshTokens',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false // This table only needs a creation timestamp
  });

  return RefreshToken;
};