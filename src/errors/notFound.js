const ApiError = require("./apiError");

class NotFoundError extends ApiError {
  constructor(message = "Not Found", errors = []) {
    super(message, 404, errors);
  }
}

module.exports = NotFoundError;