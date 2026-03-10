const ApiError = require("./apiError");

class MissingTokenError extends ApiError {
    constructor(message = "Missing Token", errors = []) {
        super(message, 401, errors);
    }
}

module.exports = MissingTokenError;