const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');
const roomRoutes = require('./roomRoutes');
const authMiddleware = require('../middlewares/authMiddleware');
const ThirdpartyIntegration = require('../models/ThirdpartyIntegration')
const { GoogleGenAI } = require("@google/genai");

router.use('/auth', authRoutes);

router.use('/rooms', authMiddleware, roomRoutes)
router.get("/delay", async (req, res) => {
    try {

        const config = await ThirdpartyIntegration.findOne();

        return res.status(200).json({
            success: true,
            data: config
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }
});
router.post("/delay", async (req, res) => {
    try {

        const { delay, isActive } = req.body;

        const config = await ThirdpartyIntegration.findOneAndUpdate(
            {},
            { delay, isActive },
            {
                new: true,
                upsert: true
            }
        );

        return res.status(200).json({
            success: true,
            data: config
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }
});

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

router.get("/ai", async (req, res) => {
    try {

        const { question } = req.query;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Write a short bedtime story about a unicorn. ${question || ""}`
        });

        return res.status(200).json({
            message: response.text
        });

    } catch (error) {
        console.error("Gemini error:", error.message);
        return res.status(500).json({
            message: "AI generation failed"
        });
    }
});

module.exports = router;