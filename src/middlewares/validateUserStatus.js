const Enums = require('../utils/constants');
const User = require('../models/user');
const { UnauthorizedError, NotFoundError } = require('../errors');
const logger = require('../utils/logger');

const validateUserStatus = async (userId) => {
    const user = await User.findById(userId).select('role isBlock isDeleted verificationStatus isActive');
    logger.info(`[validateUserStatus] User object: ${JSON.stringify(user.toObject(), null, 2)}`);

    if (!user) {
        logger.info(`[validateUserStatus] User not found: userId=${userId}`)
        throw new NotFoundError('User not found');
    }
    if (user.isDeleted) {
        logger.info(`[validateUserStatus] User is deleted: userId=${userId}`);
        throw new NotFoundError('User not found');
    }
    if (user.isBlock) {
        throw new UnauthorizedError('User is blocked');
    }
    return true;
};

module.exports = validateUserStatus;