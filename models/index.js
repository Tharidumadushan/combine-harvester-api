'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
// point to the config file in the parent directory
const config = require(__dirname + '/../config/config.js')[env];
const db = {};

let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    dialect: config.dialect,
    logging: false // Set to console.log to see SQL queries
  });
}

// --- 2. LOAD ALL MODELS ---
// This code automatically scans the /models directory,
// imports each.js file (except this one), and adds
// the initialized model to the 'db' object.
fs
 .readdirSync(__dirname)
 .filter(file => {
    return (file.indexOf('.')!== 0) && (file!== basename) && (file.slice(-3) === '.js');
  })
 .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

// --- 3. DEFINE ALL ASSOCIATIONS ---
// After all models are loaded, we define their relationships here.
// This is the "brain" of the database structure.

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// User 1:1 UserProfile
db.User.hasOne(db.UserProfile, {
  foreignKey: 'user_id',
  onDelete: 'CASCADE'
});
db.UserProfile.belongsTo(db.User, {
  foreignKey: 'user_id'
});

// User 1:M RefreshToken [1]
db.User.hasMany(db.RefreshToken, {
  foreignKey: 'user_id',
  onDelete: 'CASCADE'
});
db.RefreshToken.belongsTo(db.User, {
  foreignKey: 'user_id'
});

// User (Owner) 1:M Harvester [1]
db.User.hasMany(db.Harvester, {
  foreignKey: 'owner_id',
  onDelete: 'RESTRICT' // Protect harvesters if owner is deleted
});
db.Harvester.belongsTo(db.User, {
  as: 'owner', // Alias to distinguish from a farmer
  foreignKey: 'owner_id'
});

// User (Farmer) 1:M Field [1]
db.User.hasMany(db.Field, {
  foreignKey: 'farmer_id',
  onDelete: 'CASCADE'
});
db.Field.belongsTo(db.User, {
  as: 'farmer', // Alias
  foreignKey: 'farmer_id'
});

// --- Booking Associations (The Central Hub) ---

// User (Farmer) 1:M Booking [1]
db.User.hasMany(db.Booking, {
  foreignKey: 'farmer_id',
  onDelete: 'SET NULL'
});
db.Booking.belongsTo(db.User, {
  as: 'farmer', // Alias
  foreignKey: 'farmer_id'
});

// Harvester 1:M Booking [1]
db.Harvester.hasMany(db.Booking, {
  foreignKey: 'harvester_id',
  onDelete: 'SET NULL'
});
db.Booking.belongsTo(db.Harvester, {
  foreignKey: 'harvester_id'
});

// Field 1:M Booking
db.Field.hasMany(db.Booking, {
  foreignKey: 'field_id',
  onDelete: 'SET NULL'
});
db.Booking.belongsTo(db.Field, {
  foreignKey: 'field_id'
});

// HarvesterPricing 1:M Booking [1]
db.HarvesterPricing.hasMany(db.Booking, {
  foreignKey: 'pricing_id',
  onDelete: 'SET NULL'
});
db.Booking.belongsTo(db.HarvesterPricing, {
  foreignKey: 'pricing_id'
});

// Harvester 1:M HarvesterPricing [1]
db.Harvester.hasMany(db.HarvesterPricing, {
  foreignKey: 'harvester_id',
  onDelete: 'CASCADE'
});
db.HarvesterPricing.belongsTo(db.Harvester, {
  foreignKey: 'harvester_id'
});

// Harvester 1:M HarvesterAvailability [1]
db.Harvester.hasMany(db.HarvesterAvailability, {
  foreignKey: 'harvester_id',
  onDelete: 'CASCADE'
});
db.HarvesterAvailability.belongsTo(db.Harvester, {
  foreignKey: 'harvester_id'
});

// --- Audit & Notification Associations ---

// Booking 1:M BookingStatusHistory [1]
db.Booking.hasMany(db.BookingStatusHistory, {
  foreignKey: 'booking_id',
  onDelete: 'CASCADE'
});
db.BookingStatusHistory.belongsTo(db.Booking, {
  foreignKey: 'booking_id'
});

// User 1:M BookingStatusHistory (who made the change)
db.User.hasMany(db.BookingStatusHistory, {
  foreignKey: 'changed_by_user_id',
  onDelete: 'SET NULL'
});
db.BookingStatusHistory.belongsTo(db.User, {
  foreignKey: 'changed_by_user_id'
});

// User (Recipient) 1:M Notification [1]
db.User.hasMany(db.Notification, {
  foreignKey: 'user_id',
  onDelete: 'CASCADE'
});
db.Notification.belongsTo(db.User, {
  foreignKey: 'user_id'
});

// Booking 1:M Notification (for context)
db.Booking.hasMany(db.Notification, {
  foreignKey: 'booking_id',
  onDelete: 'SET NULL' // Keep notification even if booking is deleted
});
db.Notification.belongsTo(db.Booking, {
  foreignKey: 'booking_id'
});

db.HarvesterAvailability.hasMany(db.Booking, {
  foreignKey: "availability_id",
  as: "Booking",
});

db.Booking.belongsTo(db.HarvesterAvailability, {
  foreignKey: "availability_id",
  as: "HarvesterAvailability",
});


// Export the db object, which now contains:
// 1. The Sequelize connection instance ('sequelize')
// 2. The Sequelize library itself ('Sequelize')
// 3. All your initialized and associated models (db.User, db.Booking, etc.)
db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;