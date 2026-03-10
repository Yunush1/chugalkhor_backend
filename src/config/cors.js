const cors = require('cors');
const allowedOrigins = (process.env.CLIENT_URLS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
const fallbackOrigins = [
    'http://localhost:3000',
    'https://book-swapping.netlify.app',
    'https://book-swapping-viyi.vercel.app'
];

const corsOptions = {

    origin: function (origin, callback) {
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