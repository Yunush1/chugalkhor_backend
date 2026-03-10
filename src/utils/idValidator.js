const mongoose = require("mongoose");

const validateObjectIds = (...ids) => {
    for (const id of ids) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error("Invalid ID format");
        }
    }
};

module.exports = { validateObjectIds }