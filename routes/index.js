const express = require('express');
const router = express.Router();

// Import all the modular route files
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const harvesterRoutes = require('./harvester.routes');
const fieldRoutes = require('./field.routes');
const bookingRoutes = require('./booking.routes');

// Mount the imported routes onto their base paths
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/harvesters', harvesterRoutes);
router.use('/fields', fieldRoutes);
router.use('/bookings', bookingRoutes);

// A simple health check route for the v1 API
router.get('/', (req, res) => {
  res.status(200).json({
    message: 'Combine Harvester API v1 is running.'
  });
});

module.exports = router;