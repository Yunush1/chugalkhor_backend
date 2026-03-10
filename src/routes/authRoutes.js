const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

// router.post('/login-via-otp', authController.loginByOTP);
router.post('/login-via-password', authController.loginByPassword);
router.post('/google/login', authController.loginWithGoogle);
// router.get('/google/callback', authController.googleCallback);

// router.post('/verify-otp', authController.verifyOtp);
// router.post('/send-otp', authController.loginByOTP);
router.post('/signup', authController.register);
router.get('/get-access-token',authController.getAccessToken);
router.get('/validate-token', authMiddleware, authController.validateToken);


module.exports = router;