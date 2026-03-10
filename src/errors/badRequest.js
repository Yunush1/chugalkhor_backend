const ApiError = require("./apiError");

class BadRequestError extends ApiError {
  constructor(message = "Bad Request", errors = []) {
    super(message, 400, errors);
  }
}

module.exports = BadRequestError;