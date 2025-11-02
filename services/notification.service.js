const db = require('../models');
const Notification = db.Notification;

/**
 * Creates a notification entry in the database queue.
 * This should be called *inside* a database transaction in the controller.
 *
 * @param {object} details - Notification details
 * @param {string} details.user_id - The ID of the user to notify
 * @param {string} details.message - The message content
 * @param {string} details.channel - 'EMAIL', 'SMS', or 'WHATSAPP'
 * @param {string} [details.booking_id] - Optional booking ID context
 * @param {object} [transaction] - The Sequelize transaction object
 * @returns {Promise<void>}
 */
const queueNotification = async ({ user_id, message, channel, booking_id }, transaction) => {
  try {
    await Notification.create({
      user_id,
      message,
      channel,
      booking_id,
      status: 'PENDING'
    }, { transaction: transaction }); // Pass the transaction
  } catch (error) {
    // Log the error, but don't fail the main transaction
    // The main operation (e.g., booking) is more important than the notification
    console.error('Failed to queue notification:', error);
  }
};

/**
 * A helper function to easily queue a booking confirmation notification
 * for a farmer.
 *
 * @param {object} booking - The Sequelize booking object
 * @param {object} transaction - The Sequelize transaction
 */
exports.queueBookingConfirmation = async (booking, transaction) => {
  await queueNotification({
    user_id: booking.farmer_id,
    message: `Your booking (ID: ${booking.booking_id}) has been confirmed.`,
    channel: 'EMAIL', // Or 'SMS'
    booking_id: booking.booking_id
  }, transaction);
};

/**
 * A helper function to queue a new booking request notification
 * for a harvester owner.
 *
 * @param {object} booking - The Sequelize booking object
 * @param {string} owner_id - The ID of the harvester owner
 * @param {object} transaction - The Sequelize transaction
 */
exports.queueNewBookingRequest = async (booking, owner_id, transaction) => {
  await queueNotification({
    user_id: owner_id,
    message: `You have a new booking request (ID: ${booking.booking_id}).`,
    channel: 'EMAIL', // Or 'SMS'
    booking_id: booking.booking_id
  }, transaction);
};

// --- Notification Sending Logic (For a Separate Worker Process) ---

/**
 * This function would be run by a separate background worker,
 * NOT by the main API.
 *
 * It polls the database for 'PENDING' notifications and sends them
 * using the appropriate third-party API.
 */
exports.processNotificationQueue = async () => {
  const pendingNotifications = await Notification.findAll({
    where: { status: 'PENDING' },
    limit: 10 // Process 10 at a time
  });

  for (const notif of pendingNotifications) {
    try {
      if (notif.channel === 'EMAIL') {
        // await sendEmailWithSendGrid(notif.user.email, notif.message);
        console.log(`SIMULATE: Sending EMAIL to user ${notif.user_id}`);
      } else if (notif.channel === 'SMS') {
        // await sendSmsWithTwilio(notif.user.phone_number, notif.message);
        console.log(`SIMULATE: Sending SMS to user ${notif.user_id}`);
      }

      // If successful, mark as 'SENT'
      notif.status = 'SENT';
      await notif.save();

    } catch (error) {
      // If failed, mark as 'FAILED' to prevent retries
      notif.status = 'FAILED';
      await notif.save();
      console.error(`Failed to send notification ${notif.notification_id}:`, error);
    }
  }
};