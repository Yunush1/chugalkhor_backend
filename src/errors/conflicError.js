const ApiError = require("./apiError");

class ConflictError extends ApiError {
  constructor(message = "Conflict", errors = []) {
    super(message, 409, errors);
  }
}

module.exports = ConflictError;