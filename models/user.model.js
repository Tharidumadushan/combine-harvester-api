const bcrypt = require('bcryptjs');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    user_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: false
    },
    phone_number: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true
    },
    role: {
      type: DataTypes.ENUM('SYSTEM_ADMIN', 'HARVESTER_OWNER', 'FARMER'),
      allowNull: false
    },
    language_preference: {
      type: DataTypes.STRING(5),
      allowNull: false,
      defaultValue: 'en'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    tableName: 'Users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      // This hook automatically hashes the password before a new user is created
      beforeCreate: async (user) => {
        if (user.password_hash) {
          const salt = await bcrypt.genSalt(10);
          user.password_hash = await bcrypt.hash(user.password_hash, salt);
        }
      }
    }
  });

  // This instance method is added to the User model
  // It allows you to easily validate a password in your auth controller
  User.prototype.validPassword = async function(password) {
    return await bcrypt.compare(password, this.password_hash);
  };

  return User;
};