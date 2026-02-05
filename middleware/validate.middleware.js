const { check, validationResult } = require('express-validator');

/**
 * A middleware function that runs the validation rules
 * and returns a 400 Bad Request if any errors are found.
 */
const validate = (validations) => {
  return async (req, res, next) => {
    // Run all validation rules
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      // No errors, proceed to the controller
      return next();
    }

    // Errors found, return 400 with the error details
    res.status(400).json({
      errors: errors.array()
    });
  };
};

const message = 'Test';
/**
 * Validation rules for the user registration endpoint.
 */
const validateRegistration = [
  check('email').withMessage(message,"Role must be either 'FARMER' or 'HARVESTER_OWNER'.")
];

/**
 * Validation rules for the user login endpoint.
 */
const validateLogin = [
  check('email')
  .isEmail().withMessage(message,'Please provide a valid email address.')
  .normalizeEmail(),
  
  check('password')
  .notEmpty().withMessage(message,'Password is required.')
];

/**
 * Validation rules for creating a new field.
 */
//const validateField =;

// Add more validation rule arrays here as needed...
// e.g., validateHarvester, validateBooking, etc.

module.exports = {
  validate,
  validateRegistration,
  validateLogin,
  validateField
};