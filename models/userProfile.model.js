// models/UserProfile.js
module.exports = (sequelize, DataTypes) => {
  const UserProfile = sequelize.define('UserProfile', {

    user_id: {
      type:       DataTypes.UUID,
      primaryKey: true,
      allowNull:  false,
    },

    // ── Name ────────────────────────────────────────────────────────────────
    first_name: {
      type:      DataTypes.STRING(100),
      allowNull: false,
    },
    last_name: {
      type:      DataTypes.STRING(100),
      allowNull: false,
    },

    // ── Business (optional — mainly for HARVESTER_OWNER) ──────────────────
    business_name: {
      type:      DataTypes.STRING(255),
      allowNull: true,
    },

    // ── Legacy address field — kept for backward compatibility ─────────────
    // New code should use the structured fields below.
    // Do NOT remove until all data is migrated.
    address: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },

    // ── Structured address fields (new) ───────────────────────────────────
    address_line1: {
      type:      DataTypes.STRING(255),
      allowNull: true,
    },
    address_line2: {
      type:      DataTypes.STRING(255),
      allowNull: true,
    },
    city: {
      type:      DataTypes.STRING(100),
      allowNull: true,
    },
    state_province: {
      type:      DataTypes.STRING(100),
      allowNull: true,
    },
    postal_code: {
      type:      DataTypes.STRING(20),
      allowNull: true,
    },
    country: {
      type:      DataTypes.STRING(100),
      allowNull: true,
    },

  }, {
    tableName:  'UserProfiles',
    timestamps: true,
    createdAt:  'created_at',
    updatedAt:  'updated_at',
  });

  return UserProfile;
};