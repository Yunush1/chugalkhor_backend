const ApiError = require("./apiError");

class InvalidTokenError extends ApiError {
    constructor(message = "Invalid Token", errors = []) {
        super(message, 403, errors);
    }
}

module.exports = InvalidTokenError;