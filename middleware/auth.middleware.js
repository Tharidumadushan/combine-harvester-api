const jwt = require('jsonwebtoken');
const config = require('../config/config');

/**
 * Middleware to verify the JWT Access Token.
 * This should be applied to all routes that require a user to be logged in.
 *
 * If the token is valid, it attaches the user's ID and role to the
 * 'req' object (req.userId, req.userRole) for use in later
 * middleware or controllers.
 */
const verifyToken = (req, res, next) => {
  // 1. Get the token from the 'Authorization' header
  let token = req.headers['authorization'];

  if (!token) {
    return res.status(403).send({
      message: 'No token provided. Access forbidden.'
    });
  }

  // 2. Check if the token is a 'Bearer' token and extract it
  if (token.startsWith('Bearer ')) {
    // Remove 'Bearer ' from the string
    token = token.slice(7, token.length);
  } else {
    return res.status(401).send({
      message: 'Token format is invalid. Must be "Bearer [token]".'
    });
  }

  // 3. Verify the token's signature and expiration
  jwt.verify(token, config.jwt_secret, (err, decoded) => {
    if (err) {
      // If the token is expired, err.name will be 'TokenExpiredError'
      if (err.name === 'TokenExpiredError') {
        return res.status(401).send({
          message: 'Unauthorized! Access Token has expired.'
        });
      }
      // For any other error (e.g., invalid signature)
      return res.status(401).send({
        message: 'Unauthorized! Invalid token.'
      });
    }

    // 4. Token is valid. Attach user info to the request object.
    // The 'decoded' payload contains { id: user.user_id, role: user.role }
    // which we set in the auth.controller when creating the token.
    req.userId = decoded.id;
    req.userRole = decoded.role;
    
    // 5. Pass control to the next middleware or the controller
    next();
  });
};

module.exports = {
  verifyToken
};