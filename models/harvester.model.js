module.exports = (sequelize, DataTypes) => {

  const Harvester = sequelize.define("Harvester", {

    // ── Primary key ──────────────────────────────────────────────────────────
    harvester_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    // ── Owner ────────────────────────────────────────────────────────────────
    owner_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    // ── Basic info ───────────────────────────────────────────────────────────
    harvester_name: {          // ← was missing — root cause of the error
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    model_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    brand: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    manufacture_year: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    contact_number: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },

    // ── Performance / specs ──────────────────────────────────────────────────
    capacity: {
      type: DataTypes.STRING(100), // legacy — keep as string
      allowNull: true,
    },

    engine_hp: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    fuel_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    acres_per_hour: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },

    header_width_feet: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },

    grain_tank_capacity_liters: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    machine_weight_kg: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    engine_working_hours: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // ── Agriculture ──────────────────────────────────────────────────────────
    supported_crops: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },

    terrain_type: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    // ── Service / booking ────────────────────────────────────────────────────
    transport_available: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    operator_included: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    current_district: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    service_radius_km: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: true,
    },

    // ── Location ─────────────────────────────────────────────────────────────
    // DataTypes.GEOMETRY lets Sequelize pass Sequelize.fn() values through
    // to Postgres without interference — the DB handles the geography type.
    home_location: {             // ← was missing
      type: DataTypes.GEOMETRY("POINT", 4326),
      allowNull: true,
    },

    current_location: {          // ← was missing
      type: DataTypes.GEOMETRY("POINT", 4326),
      allowNull: true,
    },

    location_updated_at: {       // ← was missing
      type: DataTypes.DATE,
      allowNull: true,
    },

    live_tracking_enabled: {     // ← was missing
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    // ── Media ────────────────────────────────────────────────────────────────
    thumbnail_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // ── Trust / reviews ──────────────────────────────────────────────────────
    average_rating: {
      type: DataTypes.DECIMAL(2, 1),
      allowNull: false,
      defaultValue: 0,
    },

    completed_jobs: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

  }, {
    tableName: "Harvesters",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  });

  return Harvester;
};