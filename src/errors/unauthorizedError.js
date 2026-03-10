const ApiError = require("./apiError");

class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized", errors = []) {
    super(message, 401, errors);
  }
}

module.exports = UnauthorizedError;