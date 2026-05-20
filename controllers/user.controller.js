// controllers/user.controller.js
const db          = require('../models');
const User        = db.User;
const UserProfile = db.UserProfile;

// ── All profile attributes returned to the frontend ─────────────────────────
const PROFILE_ATTRIBUTES = [
  'first_name',
  'last_name',
  'business_name',
  'address',
  'address_line1',
  'address_line2',
  'city',
  'state_province',
  'postal_code',
  'country',
];

const USER_ATTRIBUTES = [
  'user_id',
  'email',
  'phone_number',
  'role',
  'language_preference',
  'is_active',
  'created_at',
];

// ─── GET /users/me ────────────────────────────────────────────────────────────
// Returns the authenticated user's full profile.
exports.getMyProfile = async (req, res) => {
  try {
    const userId = req.userId; // injected by verifyToken middleware

    const user = await User.findByPk(userId, {
      attributes: USER_ATTRIBUTES,
      include: [{
        model:      UserProfile,
        attributes: PROFILE_ATTRIBUTES,
      }],
    });

    if (!user) {
      return res.status(404).json({ message: 'User profile not found.' });
    }

    return res.status(200).json(user);

  } catch (error) {
    console.error('[getMyProfile]', error);
    return res.status(500).json({
      message: error.message || 'Error fetching profile.',
    });
  }
};

// ─── GET /users/:userId ───────────────────────────────────────────────────────
// Returns another user's public profile.
// Sensitive fields (password_hash, is_active) are excluded automatically
// because they're not in USER_ATTRIBUTES.
exports.getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByPk(userId, {
      attributes: USER_ATTRIBUTES,
      include: [{
        model:      UserProfile,
        attributes: PROFILE_ATTRIBUTES,
      }],
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json(user);

  } catch (error) {
    console.error('[getUserById]', error);
    return res.status(500).json({
      message: error.message || 'Error fetching user.',
    });
  }
};

// ─── GET /users ───────────────────────────────────────────────────────────────
// Admin-only: returns all users with their profiles.
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: USER_ATTRIBUTES,
      include: [{
        model:      UserProfile,
        attributes: PROFILE_ATTRIBUTES,
      }],
      order: [['created_at', 'DESC']],
    });

    return res.status(200).json(users);

  } catch (error) {
    console.error('[getAllUsers]', error);
    return res.status(500).json({
      message: error.message || 'Error fetching users.',
    });
  }
};

// ─── PUT /users/me ────────────────────────────────────────────────────────────
// Updates the authenticated user's profile.
// Partial updates are supported — fields not sent are left unchanged.
exports.updateMyProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const { email, phone_number, language_preference } = req.body;
    const {
      first_name,
      last_name,
      business_name,
      address_line1,
      address_line2,
      city,
      state_province,
      postal_code,
      country,
    } = req.body.UserProfile ?? {};

    // ── Validate required fields if they are explicitly sent ──────────────
    if (first_name !== undefined && !first_name.trim()) {
      return res.status(400).json({ message: 'first_name cannot be empty.' });
    }
    if (last_name !== undefined && !last_name.trim()) {
      return res.status(400).json({ message: 'last_name cannot be empty.' });
    }
    if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (
      phone_number !== undefined &&
      !/^(\+94|0)?[0-9\s]{9,13}$/.test(phone_number.replace(/\s/g, ''))
    ) {
      return res.status(400).json({
        message: 'Enter a valid Sri Lankan phone number.',
      });
    }

    // ── Fetch both records in parallel ────────────────────────────────────
    const [profile, user] = await Promise.all([
      UserProfile.findByPk(userId),
      User.findByPk(userId),
    ]);

    if (!profile || !user) {
      return res.status(404).json({ message: 'User or profile not found.' });
    }

    // ── Build UserProfile update payload ──────────────────────────────────
    // Only include keys that were actually sent — undefined = keep existing value.
    const profileUpdates = {};
    if (first_name    !== undefined) profileUpdates.first_name    = first_name.trim();
    if (last_name     !== undefined) profileUpdates.last_name     = last_name.trim();
    if (business_name !== undefined) profileUpdates.business_name = business_name?.trim() || null;
    if (address_line1 !== undefined) profileUpdates.address_line1 = address_line1?.trim() || null;
    if (address_line2 !== undefined) profileUpdates.address_line2 = address_line2?.trim() || null;
    if (city          !== undefined) profileUpdates.city          = city?.trim() || null;
    if (state_province !== undefined) profileUpdates.state_province = state_province?.trim() || null;
    if (postal_code   !== undefined) profileUpdates.postal_code   = postal_code?.trim() || null;
    if (country       !== undefined) profileUpdates.country       = country?.trim() || null;

    // ── Build User update payload ──────────────────────────────────────────
    const userUpdates = {};
    if (email               !== undefined) userUpdates.email               = email.trim();
    if (phone_number        !== undefined) userUpdates.phone_number        = phone_number.trim();
    if (language_preference !== undefined) userUpdates.language_preference = language_preference;

    // ── Save both in parallel ─────────────────────────────────────────────
    await Promise.all([
      Object.keys(profileUpdates).length ? profile.update(profileUpdates) : Promise.resolve(),
      Object.keys(userUpdates).length    ? user.update(userUpdates)       : Promise.resolve(),
    ]);

    // Return the updated record so the frontend doesn't need a second request
    const updated = await User.findByPk(userId, {
      attributes: USER_ATTRIBUTES,
      include: [{
        model:      UserProfile,
        attributes: PROFILE_ATTRIBUTES,
      }],
    });

    return res.status(200).json(updated);

  } catch (error) {
    console.error('[updateMyProfile]', error);
    return res.status(500).json({
      message: error.message || 'Error updating profile.',
    });
  }
};