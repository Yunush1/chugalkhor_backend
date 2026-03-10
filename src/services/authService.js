const User = require('../models/user');
const jwtService = require('../utils/jwtService');
const { OAuth2Client } = require('google-auth-library')
const crypto = require('crypto');
const { ConflictError, BadRequestError, NotFoundError, InvalidTokenError, UnauthorizedError } = require('../errors');
const logger = require('../utils/logger');
const { hashPassword, comparePassword } = require('../utils/hashedPassword');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID); // ← your Web client ID

const generateAuthTokens = (user, onlyAccessToken = false) => {
    const payload = {
        _id: user._id.toString(),
        role: user.role,
        sessionId: user.sessionId
    };

    const accessToken = jwtService.generateAccessToken(payload);

    if (onlyAccessToken) {
        return { accessToken };
    }

    const refreshToken = jwtService.generateRefreshToken(payload);

    return { accessToken, refreshToken };
};

const register = async (user) => {
    try {
        const {
            email,
            password,
            name,
            mobileNumber,
            latitude,
            longitude,
            username
        } = user;

        // 1. Check for existing user by email (most common unique key)
        const userExists = await User.findOne({ email });
        if (userExists) {
            throw new ConflictError('User with this email already exists');
        }

        // Optional: also check username if provided and different from email
        if (username && username !== email) {
            const usernameExists = await User.findOne({ username });
            if (usernameExists) {
                throw new ConflictError('Username already taken');
            }
        }

        const hashedPassword = await hashPassword(password);

        // Prepare location object – only if both coordinates are provided


        const newUser = new User({
            name,
            email,
            username: username || email,           // fallback to email if no username
            password: hashedPassword,
            mobileNumber: mobileNumber || undefined, // will be sparse if undefined
            location: {
                type: "Point",
                coordinates: [Number(longitude), Number(latitude)]   // ← longitude first!
            }                              // undefined = no location set
        });

        const savedUser = await newUser.save();

        const { accessToken, refreshToken } = generateAuthTokens(savedUser);

        // Optionally remove sensitive fields before returning
        const userResponse = savedUser.toObject();
        delete userResponse.password;

        return {
            statusCode: 201,
            success: true,
            message: 'Registration successfully',
            accessToken,
            refreshToken,
            user: userResponse
        };
    } catch (error) {
        logger.error("AuthService: register user failed", {
            error: error.message,
            stack: error.stack,
        });

        // Re-throw known errors (ConflictError, ValidationError, etc.)
        throw error;
    }
};

const loginByPassword = async ({ identifier, password }) => {
    try {
        if (!identifier || !password) {
            throw new BadRequestError("Identifier (email, username or mobile) and password are required.");
        }

        // Normalize input (emails/usernames are lowercase in schema)
        const normalized = identifier.trim().toLowerCase();

        // Build flexible query — any one of the three can match
        const user = await User.findOne({
            $or: [
                { email: normalized },
                { username: normalized } // mobile usually not lowercased — but safe
            ]
        }).select('+password'); // important: bring password back

        if (!user) {
            throw new BadRequestError('Invalid credentials');
        }

        if (user.isBot) {
            throw new BadRequestError('You are not able to login!')
        }

        const isPasswordMatch = await comparePassword(password, user.password);

        if (!isPasswordMatch) {
            throw new BadRequestError('Invalid credentials');
        }

        // Update sessionId (good practice for token invalidation on logout elsewhere)
        user.sessionId = crypto.randomBytes(16).toString('hex');
        await user.save();

        const { accessToken, refreshToken } = generateAuthTokens(user);

        logger.info(`AuthService: login successful for identifier=${identifier} name= ${user.name}`);

        return {
            success: true,
            message: 'Login successful',
            accessToken,
            refreshToken,
            user: {
                name: user.name,
                username: user.username,
                email: user.email,
                mobileNumber: user.mobileNumber,
                role: user.role,
            }
        };

    } catch (error) {
        logger.error(`AuthService: loginByPassword failed ${JSON.stringify({
            identifier: identifier || 'unknown',
            error: error.message
        })}`);
        throw {
            status: false,
            message: 'Failed to login, Try again!'
        };
    }
};

const getAccessToken = async ({ refreshToken }) => {
    try {
        logger.info("AuthService: getAccessToken request: ");
        const decoded = await jwtService.verifyRefreshToken({ token: refreshToken });
        logger.info("AuthService: getAccessToken decoded: ", decoded);
        const user = await User.findById(decoded._id);
        if (!user) {
            throw new NotFoundError('User not found');
        }
        const { accessToken } = generateAuthTokens(user);
        return {
            success: true,
            accessToken
        };
    } catch (error) {
        logger.error("AuthService: getAccessToken failed", error);
        throw error;
    }
}

const validateToken = async ({ userId }) => {
    try {
        logger.info(`[AuthService] validate Token with userId: ${userId}`)
        const user = await User.findById(userId).select('name username email role gender').lean();
        if (!user) {
            throw new NotFoundError('User not found')
        }
        const { accessToken } = generateAuthTokens(user);
        return {
            status: true,
            message: 'Token validate successfully',
            user,
            accessToken
        }
    } catch (error) {
        throw error
    }
}

const loginWithGoogle = async ({ idToken }) => {
    try {

        if (!idToken) {
            return res.status(400).json({ success: false, message: 'ID token is required' });
        }

        // Verify the token
        const ticket = await client.verifyIdToken({
            idToken: idToken,
            audience: process.env.GOOGLE_CLIENT_ID,  // Must match your frontend Client ID
            // Optional: if you have Android/iOS clients too → audience: [WEB_ID, ANDROID_ID, IOS_ID]
        });

        const payload = ticket.getPayload();

        if (!payload) {
            throw new InvalidTokenError('Invalid google token');
        }

        // Extract useful data
        const {
            sub: googleId,     // Google's unique user ID
            email,
            email_verified,
            name,
            picture,
            given_name,
            family_name,
        } = payload;

        // Optional: enforce email verified
        if (!email_verified) {
            throw new UnauthorizedError('Email is not verified')
        }

        // Now: find or create user in your database
        // Example with Mongoose:
        /*
        let user = await User.findOne({ googleId });
        if (!user) {
          user = new User({
            googleId,
            email,
            name: name || `${given_name || ''} ${family_name || ''}`.trim(),
            profilePicture: picture,
            // role: 'user',
          });
          await user.save();
        }
        */


        // Send response to frontend
        return {
            success: true,
            user: {
                googleId,
                email,
                name,
                picture,
            },
        };

    } catch (error) {
        console.error('Google verify error:', error.message);
        return { success: false, message: 'Server error during Google verification' };
    }
}

const logout = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new NotFoundError('User not found');
        }
        user.sessionId = null;
        await user.save();
        return {
            success: true,
            message: 'Logout successful',
        };
    } catch (error) {
        logger.error("AuthService: logout failed", error);
        throw error;
    }
}

module.exports = {
    register,
    loginByPassword,
    getAccessToken,
    logout,
    validateToken,
    loginWithGoogle
}