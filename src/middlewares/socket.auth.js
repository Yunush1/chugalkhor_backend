const { verifyAccessToken } = require('../utils/jwtService');
const logger = require('../utils/logger');
const Enums = require('../utils/constants');
const User = require('../models/user');
const validateUserStatus = require('./validateUserStatus');

module.exports = async (socket, next) => {
  // const token = socket.handshake.auth.accessToken;
  const token = socket.handshake.auth?.accessToken || socket.handshake.query?.token;
  if (!token) {
    logger.warn('[SOCKET AUTH] No token received from client');
    return next(new Error('Authentication token required'));
  }
  let decoded;
  try {
    decoded = await verifyAccessToken(token);
  } catch (err) {
    logger.error(`[SOCKET AUTH] Token verification failed: ${err.message}`);
    return next(new Error('Invalid or expired token'));
  }
  const userId = decoded._id;
  try {
    await validateUserStatus(userId);
  } catch (err) {
    logger.warn(`[SOCKET AUTH] User validation failed: ${err.message}`);
    return next(new Error(err.message));
  }

  socket.user = {
    userId,
    role: decoded.role,
    name: decoded.name || `User-${userId.slice(0, 5)}`,
  };

  logger.info(`[SOCKET AUTH] Token verified for userId=${userId}, role=${decoded.role}`);
  const user = await User.findById(userId).select('name role email mobileNumber');
  if (!user) {
    logger.warn(`[SOCKET AUTH] User not found in DB: ${userId}`);
    return next(new Error('User not found'));
  }
  logger.info(`[SOCKET AUTH] User connected: ${user.name || 'Unnamed'} | Role=${user.role} | Email=${user.email || 'N/A'} | Mobile=${user.mobileNumber}`);
  next();
};