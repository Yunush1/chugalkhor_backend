const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');
const roomRoutes = require('./roomRoutes');
const authMiddleware = require('../middlewares/authMiddleware');
const { GoogleGenAI } = require("@google/genai");

router.use('/auth', authRoutes);

router.use('/rooms', authMiddleware, roomRoutes)

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