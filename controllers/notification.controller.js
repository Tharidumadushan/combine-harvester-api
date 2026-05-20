const db = require('../models');
const { Op } = require('sequelize');

const Notification = db.Notification;

exports.getMyNotifications = async (req, res) => {
  try {
    userId = req.userId;
    notifications = await Notification.findAll({ where: { user_id: userId } })
    res.status(200).send(notifications);
  } catch (error)
 {
    res.status(500).send({ message: error.message || 'Error fetching fields.' });
  }
};