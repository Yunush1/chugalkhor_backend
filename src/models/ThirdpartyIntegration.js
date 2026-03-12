const mongoose = require("mongoose");

const ThirdpartyIntegrationSchema = new mongoose.Schema({
  delay: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model(
  "ThirdpartyIntegration",
  ThirdpartyIntegrationSchema
);