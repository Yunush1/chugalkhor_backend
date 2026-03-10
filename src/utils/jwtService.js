const User = require('../models/user'); // make sure you import this
const UnauthorizedError = require('../errors/unauthorizedError'); // your custom error
const logger = require('./logger'); // your logger utility
const jwt = require("jsonwebtoken");
// const Enums = require('./constants');
const JWT_SECRET = process.env.JWT_SECRET || "secret";
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || "7d";
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || "7d";

module.exports = {
  generateAccessToken: (payload) => {
    try {
      const token = jwt.sign(
        { ...payload, tokenType: 'access' },
        JWT_SECRET,
        { expiresIn: JWT_ACCESS_EXPIRY }
      );
      logger.info(`Access token generated for userId: ${payload._id}`);
      return token;
    } catch (err) {
      logger.error('Access token generation failed:', err.message);
      throw err;
    }
  },

  generateRefreshToken: (payload) => {
    try {
      const token = jwt.sign(
        { ...payload, tokenType: 'refresh' },
        JWT_SECRET,
        { expiresIn: JWT_REFRESH_EXPIRY }
      );
      logger.info(`Refresh token generated for userId: ${payload._id}`);
      return token;
    } catch (err) {
      logger.error('Refresh token generation failed:', err.message);
      throw err;
    }
  },

  verifyAccessToken: async (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.tokenType !== 'access') {
        throw new Error('Invalid token type - access token required');
      }
      const user = await User.findById(decoded._id).lean();
      if (!user) throw new UnauthorizedError("User not found");
      // if (decoded?.sessionId !== user?.sessionId) {
      //   throw new UnauthorizedError("Session expired. Please log in again.");
      // }
      logger.info(`Access token verified: userId=${decoded._id}`);
      return user;

    } catch (err) {
      logger.error(`Access token verification failed: ${err.message}`);
      throw new UnauthorizedError('Invalid or expired access token');
    }
  },

  verifyRefreshToken: async ({ token }) => {
    try {
      logger.info(" Verify Refresh token ", token)
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.tokenType !== 'refresh') {
        throw new Error('Invalid token type - refresh token required');
      }
      logger.info(" decoded ", decoded)
      const user = await User.findById(decoded._id).lean();
      if (!user) throw new UnauthorizedError("User not found");
      if (decoded.sessionId !== user.sessionId) {
        throw new UnauthorizedError("Session expired. Please log in again.");
      }
      logger.info(`Refresh token verified: userId=${decoded._id}`);
      return decoded;
    } catch (err) {
      logger.error(`Refresh token verification failed: ${err.message}`);
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }
};