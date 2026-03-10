const { MissingTokenError, TokenExpiredError, InvalidTokenError } = require('../errors');
const jwtService = require('../utils/jwtService');
const validateUserStatus = require('./validateUserStatus');

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new MissingTokenError();
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = await jwtService.verifyAccessToken(token);
    req.user = decoded;
  } catch (err) {
    if (err.message === 'Invalid or expired access token') {
      throw new TokenExpiredError();
    }
    throw new InvalidTokenError();
  }
  try {
    await validateUserStatus(req.user._id);
    next();
  } catch (err) {
    next(err);
  }
};