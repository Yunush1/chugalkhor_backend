const ApiError = require("./apiError");

class TokenExpiredError extends ApiError {
  constructor(
    message = "Access token expired",
    errors = [],
    stack = ""
  ) {
    super(message, 401, errors, stack);
    this.code = "TOKEN_EXPIRED";
  }
}

module.exports = TokenExpiredError;