const authService = require("../services/authService");
const asyncHandler = require("../middlewares/asyncHandler");
const logger = require("../utils/logger");


// ================= REGISTER =================
exports.register = asyncHandler(async (req, res) => {
    logger.info("[AuthController] register request");

    const platform = req.headers["platform"];
    const result = await authService.register(req.body);

    const { refreshToken, statusCode, ...safeResponse } = result;

    // 🌐 WEB → Set httpOnly cookie
    if (platform !== "app") {
        setRefreshToken(res, refreshToken);
    }

    logger.info("[AuthController] Registration successful", {
        userId: result.user?.id,
    });

    return res.status(statusCode || 201).json({
        success: true,
        ...safeResponse,
        ...(platform === "app" && { refreshToken }),
    });
});

// ================= LOGIN =================
exports.loginByPassword = asyncHandler(async (req, res) => {
    const {
        email,
        username,
        password,
        deviceId,
        longitude,
        latitude,
        os,
        modelNumber,
        fcmToken,
    } = req.body;
    const platform = req.headers["platform"];
    const identifier = email || username;
    const requestOrigin = req.headers.origin;

    logger.info("[AuthController] loginByPassword request", {
        identifier,
        requestOrigin,
    });

    const response = await authService.loginByPassword({
        identifier,
        password,
        deviceId,
        longitude,
        latitude,
        requestOrigin,
        os,
        modelNumber,
        fcmToken,
    });

    const { refreshToken, statusCode, ...safeResponse } = response;

    // 🌐 WEB → Set httpOnly cookie
    if (platform !== "app") {
        setRefreshToken(res, refreshToken);
    }

    logger.info("[AuthController] login successful", {
        userId: response.user?.id,
    });

    return res.status(statusCode || 200).json({
        success: true,
        ...safeResponse,
        ...(platform === "app" && { refreshToken }),
    });
});

// ================= LOGIN WITH GOOGLE =================

exports.loginWithGoogle = asyncHandler(async (req, res) => {
    const { idToken } = req.body;
    const response = await authService.loginWithGoogle({ idToken })
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://accounts.google.com https://*.google.com https://*.gstatic.com; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' https://*.googleusercontent.com data: blob:; " +
        "connect-src 'self' https://accounts.google.com https://*.google.com;"
    );
    return res.json(response)
})

// ================= REFRESH ACCESS TOKEN =================
exports.getAccessToken = asyncHandler(async (req, res) => {
    const refreshToken = getRefreshToken(req);

    if (!refreshToken) {
        return res.status(401).json({
            success: false,
            message: "Refresh token missing",
        });
    }

    const result = await authService.getAccessToken({ refreshToken });

    return res.status(200).json(result);
});


// ================= VALIDATE ACCESSTOKEN =================
exports.validateToken = asyncHandler(async (req, res) => {
    const { _id } = req.user;
    const result = await authService.validateToken({ userId: _id })
    return res.status(200).json(result)
})


// ================= HELPER FUNCTIONS =================
const setRefreshToken = (res, refreshToken) => {
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge:
            Number(process.env.JWT_REFRESH_EXPIRY) ||
            7 * 24 * 60 * 60 * 1000, // 7 days
    });
};

const getRefreshToken = (req) => {
    if (!req || !req.cookies) return null;
    return req.cookies.refreshToken || null;
};