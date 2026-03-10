const dotenv = require("dotenv");
const logger = require("./src/utils/logger");
const envFile = `.env.${process.env.NODE_ENV || "development"}`;

dotenv.config({ path: envFile });
logger.info(`Starting server in ${process.env.NODE_ENV} mode...`);

const http = require("http");

const app = require("./src/app");
const connectDB = require("./src/config/db");
// Create HTTP server
const server = http.createServer(app);
const SocketManager = require("./src/config/socket");

SocketManager.initialize(server);
// Connect database
connectDB();

// Graceful shutdown handling
process.on("unhandledRejection", (err) => {
    logger.error("UNHANDLED REJECTION:", err);
    process.exit(1);
});

process.on("uncaughtException", (err) => {
    logger.error("UNCAUGHT EXCEPTION:", err);
    process.exit(1);
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});