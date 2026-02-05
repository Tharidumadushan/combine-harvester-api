const db = require('../models');
const User = db.User;

/**
 * Checks if the user has the 'HARVESTER_OWNER' role.
 * This middleware MUST run AFTER verifyToken.
 */
const isHarvesterOwner = (req, res, next) => {
  if (req.userRole && req.userRole === 'HARVESTER_OWNER') {
    next();
    return;
  }

  res.status(403).send({
    message: 'Forbidden: Requires Harvester Owner role.'
  });
};

/**
 * Checks if the user has the 'FARMER' role.
 * This middleware MUST run AFTER verifyToken.
 */
const isFarmer = (req, res, next) => {
  if (req.userRole && req.userRole === 'FARMER' || 'SYSTEM_ADMIN') {
    next();
    return;
  }

  res.status(403).send({
    message: 'Forbidden: Requires Farmer role.'
  });
};

/**
 * Checks if the user has the 'SYSTEM_ADMIN' role.
 * This middleware MUST run AFTER verifyToken.
 */
const isAdmin = (req, res, next) => {
  if (req.userRole && req.userRole === 'SYSTEM_ADMIN') {
    next();
    return;
  }

  res.status(403).send({
    message: 'Forbidden: Requires System Admin role.'
  });
};

module.exports = {
  isHarvesterOwner,
  isFarmer,
  isAdmin
};