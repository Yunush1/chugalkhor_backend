const cors = require('cors');
const logger = require('../utils/logger');
const allowedOrigins = (process.env.CLIENT_URLS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
logger.info(`[CORS config] allowed origins ${JSON.stringify(allowedOrigins)}`)
const fallbackOrigins = [
    'http://localhost:3000',
    'https://book-swapping.netlify.app',
    'https://book-swapping-viyi.vercel.app'
];

const corsOptions = {

    origin: function (origin, callback) {
        logger.info(`[Cors options] corsOptions origin ${JSON.stringify(origin)}`)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || fallbackOrigins.includes(origin)) {
            return callback(null, true);
        } else {
            console.warn(`CORS blocked for origin: ${origin}`);
            return callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
};

module.exports = cors(corsOptions);