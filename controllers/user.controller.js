const db = require('../models');
const User = db.User;
const UserProfile = db.UserProfile;

/**
 * @route GET /api/users/me
 * @description Get the profile of the currently logged-in user.
 */
exports.getMyProfile = async (req, res) => {
  try {
    const userId = req.userId;   // req.userId is added by the 'verifyToken' auth middleware
    const requestedUserId = req.params.userId; // Came with the front end to get a userdata for a different user
    let user = new(User)
    
    if(requestedUserId){
      user = await User.findByPk(requestedUserId, {
      attributes: ['email', 'phone_number', 'role', 'language_preference'], // Exclude password_hash
      include: {
        model: UserProfile,
        attributes: ['first_name', 'last_name', 'business_name', 'address','city']
      }
    });
    }
    else{
      user = await User.findByPk(userId, {
      attributes: ['email', 'phone_number', 'role', 'language_preference'], // Exclude password_hash
      include: {
        model: UserProfile,
        attributes: ['first_name', 'last_name', 'business_name', 'address','city']
      }
    });
    }
    
    if (!user) {
      return res.status(404).send({ message: 'User profile not found.' });
    }

    res.status(200).send(user);
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error fetching profile.' });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
      let user = await User.findAll( {
      attributes: ['user_id','email', 'phone_number', 'role', 'language_preference'], // Exclude password_hash
      include: {
        model: UserProfile,
        attributes: ['first_name', 'last_name', 'business_name', 'address','city']
      }
    });
    
    res.status(200).send(user);
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error fetching profile.' });
  }
};

/**
 * @route PUT /api/users/me
 * @description Update the profile of the currently logged-in user.
 */
exports.updateMyProfile = async (req, res) => {
  try {
    const userId = req.userId; // From auth middleware
    const { first_name, last_name, business_name, address, language_preference, phone_number } = req.body;

    // 1. Update UserProfile
    const profile = await UserProfile.findByPk(userId);
    if (profile) {
      profile.first_name = first_name || profile.first_name;
      profile.last_name = last_name || profile.last_name;
      profile.business_name = business_name || profile.business_name;
      profile.address = address || profile.address;
      await profile.save();
    } else {
      return res.status(404).send({ message: 'User profile not found.' });
    }
    
    // 2. Update User table (optional fields)
    const user = await User.findByPk(userId);
    if (user) {
      user.language_preference = language_preference || user.language_preference;
      user.phone_number = phone_number || user.phone_number;
      await user.save();
    }

    res.status(200).send({ message: 'Profile updated successfully.' });
  } catch (error) {
    res.status(500).send({ message: error.message || 'Error updating profile.' });
  }
};

