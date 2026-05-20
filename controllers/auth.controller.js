const db = require('../models');
const config = require('../config/config');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const User = db.User;
const UserProfile = db.UserProfile;
const RefreshToken = db.RefreshToken;

/**
 * Generates JWT Access and Refresh Tokens.
 * Stores the Refresh Token in the database.
 * @param {object} user - The Sequelize user object.
 * @returns {object} { accessToken, refreshToken }
 */
const generateTokens = async (user) => {
  try {
    // 1. Create the short-lived Access Token 
    const accessToken = jwt.sign(
      { id: user.user_id, role: user.role },
      config.jwt_secret,
      { expiresIn: config.jwt_access_expiration } // e.g., '15m'
    );

    // 2. Create the long-lived Refresh Token 
    const refreshToken = jwt.sign(
      { id: user.user_id },
      config.jwt_refresh_secret,
      { expiresIn: config.jwt_refresh_expiration } // e.g., '7d'
    );

    // 3. Store the hashed refresh token in the database for session revocation 
    const salt = await bcrypt.genSalt(10);
    const hashedToken = await bcrypt.hash(refreshToken, salt);

    await RefreshToken.create({
      user_id: user.user_id,
      token_hash: hashedToken,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new Error('Token generation failed');
  }
};

/**
 * @route POST /api/auth/register
 * @description Register a new user (Farmer or Harvester Owner).
 */
exports.register = async (req, res) => {
  // Use a transaction to ensure both User and UserProfile are created, or neither
  const t = await db.sequelize.transaction();
  
  try {
    const { email, password, phone_number, role, first_name, last_name, business_name,address } = req.body;

    // =========================================================
    // 1. CHECK IF EMAIL ALREADY EXISTS
    // =========================================================
    const existingUser = await User.findOne({
      where: {
        email: email
      }
    });

    if (existingUser) {
      await t.rollback();

      return res.status(400).json({
        success: false,
        message: 'Email is already registered'
      });
    }

    // Create the User (password will be auto-hashed by the model hook)
    const user = await User.create({
      email,
      password_hash: password, // The hook converts this to a hash
      phone_number,
      role,
    }, { transaction: t });

    // Create the associated UserProfile
    await UserProfile.create({
      user_id: user.user_id,
      first_name,
      last_name,
      business_name: business_name || null,
      address
    }, { transaction: t });

    //  commit the transaction
    await t.commit();
    
    res.status(201).send({ message: 'User registered successfully!' });

  } catch (error) {
    await t.rollback();
    res.status(500).send({ message: error.message || 'Registration failed.',info: error.errors });
  }
};

/**
 * @route POST /api/auth/login
 * @description Log in a user and return tokens.
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email: email } });
    if (!user) {
      return res.status(404).send({ message: 'User not found.' });
    }

    const passwordIsValid = await user.validPassword(password);
    if (!passwordIsValid) {
      return res.status(401).send({ message: 'Invalid password.' });
    }

    if (!user.is_active) {
      return res.status(403).send({ message: 'Account is disabled.' });
    }

    // 1. Generate Access and Refresh tokens 
    const { accessToken, refreshToken } = await generateTokens(user);

    // 2. Send Refresh Token in a secure, HttpOnly cookie 
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Use 'secure' in production
      sameSite: 'strict',
      maxAge: 1 * 24 * 60 * 60 * 1000 // 1 days
    });

    // 3. Send Access Token in the response body
    res.status(200).send({
      id: user.user_id,
      email: user.email,
      role: user.role,
      accessToken: accessToken
    });

  } catch (error) {
    res.status(500).send({ message: error.message || 'Login failed.' });
  }
};

/**
 * @route POST /api/auth/refresh-token
 * @description Use the refresh token (from HttpOnly cookie) to get a new access token.
 */
exports.refreshToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).send({ message: 'Refresh token not found.' });
    }

    // 1. Find the token in the database
    const allTokens = await RefreshToken.findAll();
    let foundToken = null;
    
    for (const token of allTokens) {
      const isValid = await bcrypt.compare(refreshToken, token.token_hash);
      if (isValid) {
        foundToken = token;
        break;
      }
    }

    if (!foundToken) {
      return res.status(403).send({ message: 'Invalid refresh token.' });
    }

    // 2. Check if token is expired
    if (new Date(foundToken.expires_at) < new Date()) {
      await foundToken.destroy(); // Clean up expired token
      return res.status(403).send({ message: 'Refresh token expired. Please log in again.' });
    }

    // 3. Verify the token's signature (ensure it's not a valid-looking but fake token)
    jwt.verify(refreshToken, config.jwt_refresh_secret, (err, decoded) => {
      if (err || decoded.id!== foundToken.user_id) {
        return res.status(403).send({ message: 'Refresh token verification failed.' });
      }

      // 4. Issue a new Access Token
      const user = { user_id: decoded.id, role: req.body.role || 'USER' }; // Role should be retrieved from user db
      
      // (Optimally, you'd fetch the user to get their current role)
      
      const newAccessToken = jwt.sign(
        { id: user.user_id, role: user.role },
        config.jwt_secret,
        { expiresIn: config.jwt_access_expiration }
      );

      res.status(200).send({ accessToken: newAccessToken });
    });

  } catch (error) {
    res.status(500).send({ message: error.message || 'Refresh token failed.' });
  }
};


/**
 * @route POST /api/auth/logout
 * @description Log out a user by invalidating their refresh token.
 */
exports.logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(200).send({ message: 'No active session.' });
    }

    // 1. Find and delete the token from the database
    const allTokens = await RefreshToken.findAll();
    let foundToken = null;
    
    for (const token of allTokens) {
      const isValid = await bcrypt.compare(refreshToken, token.token_hash);
      if (isValid) {
        foundToken = token;
        break;
      }
    }

    if (foundToken) {
      await foundToken.destroy();
    }
    
    // 2. Clear the HttpOnly cookie
    res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    
    res.status(200).send({ message: 'Logged out successfully.' });

  } catch (error) {
    res.status(500).send({ message: error.message || 'Logout failed.' });
  }
};