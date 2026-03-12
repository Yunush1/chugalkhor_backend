const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const path = require('path');
const corsMiddleware = require('./config/cors');
const errorMiddleware = require("./middlewares/error.middleware");
const startSeeders = require("./seeder");

const app = express();
app.use(cookieParser());

/**
 * ===============================
 * GLOBAL MIDDLEWARES
 * ===============================
 */
app.use(helmet()); // Security headers
app.use(corsMiddleware);
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

/**
 * ===============================
 * HEALTH CHECK
 * ===============================
 */
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "API is running 🚀",
  });
});

startSeeders()
/**
 * ===============================
 * ROUTES
 * ===============================
 */

app.use("/api", require("./routes"));

/**
 * ===============================
 * 404 HANDLER
 * ===============================
 */
app.use((req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
});

/**
 * ===============================
 * GLOBAL ERROR HANDLER
 * ===============================
 */
app.use(errorMiddleware);

module.exports = app;