// This file reads your.env file and makes the variables
// available to the rest of the application, especially Sequelize.
require('dotenv').config();

module.exports = {
  // --- DEVELOPMENT ENVIRONMENT ---
  // Configuration used when you run 'npm run dev'
  development: {
    /**
     * The username for your local PostgreSQL database.
     * Read from your.env file.
     */
    username: process.env.DB_USER,
    /**
     * The password for your local PostgreSQL database.
     * Read from your.env file.
     */
    password: process.env.DB_PASSWORD,
    /**
     * The name of your local PostgreSQL database.
     * Read from your.env file.
     */
    database: process.env.DB_NAME,
    /**
     * The host where your local database is running (usually 'localhost').
     * Read from your.env file.
     */
    host: process.env.DB_HOST,
    /**
     * The port for your local PostgreSQL database (default is 5432).
     * Read from your.env file.
     */
    port: process.env.DB_PORT,
    /**
     * The SQL dialect of the database. For this project, it is 'postgres'.
     * [1]
     */
    dialect: 'postgres',
    /**
     * Optional settings for the dialect.
     * You might add SSL settings here for a hosted dev database.
     */
    dialectOptions: {
      // e.g.,
      // ssl: {
      //   require: true,
      //   rejectUnauthorized: false 
      // }
    }
  },

  // --- TEST ENVIRONMENT ---
  // Configuration used when running automated tests
  test: {
    username: process.env.TEST_DB_USER || process.env.DB_USER,
    password: process.env.TEST_DB_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.TEST_DB_NAME || 'harvester_db_test',
    host: process.env.TEST_DB_HOST || process.env.DB_HOST,
    port: process.env.TEST_DB_PORT || process.env.DB_PORT,
    dialect: 'postgres',
    /**
     * It's good practice to turn off SQL logging when running tests
     * to keep the test output clean.
     */
    logging: false,
  },

  // --- PRODUCTION ENVIRONMENT ---
  // Configuration used when you deploy your application
  production: {
    /**
     * Production environments (like Heroku, Render, AWS) often use a
     * single connection string URL. The 'models/index.js' file is
     * set up to prioritize this environment variable if it exists.
     */
    use_env_variable: 'DATABASE_URL',
    /**
     * Fallback credentials if DATABASE_URL is not provided.
     * These should be set in your production server's environment.
     */
    username: process.env.PROD_DB_USER,
    password: process.env.PROD_DB_PASSWORD,
    database: process.env.PROD_DB_NAME,
    host: process.env.PROD_DB_HOST,
    port: process.env.PROD_DB_PORT,
    dialect: 'postgres',
    /**
     * Turn off logging in production.
     */
    logging: false,
    /**
     * Dialect options for production.
     * SSL is almost always required for secure connections
     * to a production database.
     */
    dialectOptions: {
      ssl: {
        require: true,
        // This ensures your connection rejects unverified certificates
        rejectUnauthorized: true,
      }
    }
  },
  "timezone": "+05:30",

  // --- JWT AUTHENTICATION CONFIGURATION ---
  // These are also loaded from.env and exported here
  // for easy access in your authentication controllers.
  // [1]
  /**
   * Secret key for signing short-lived Access Tokens.
   */
  jwt_secret: process.env.JWT_ACCESS_SECRET,
  /**
   * Secret key for signing long-lived Refresh Tokens.
   */
  jwt_refresh_secret: process.env.JWT_REFRESH_SECRET,
  /**
   * Expiration time for Access Tokens (e.g., "15m").
   */
  jwt_access_expiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
  /**
   * Expiration time for Refresh Tokens (e.g., "7d").
   */
  jwt_refresh_expiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
};