const hashPassword = (password, saltRounds = 10) => {
    // Implement your hashing logic here, e.g., using bcrypt
    const bcrypt = require('bcrypt');
    return bcrypt.hashSync(password, saltRounds);
}

const comparePassword = (password, hashedPassword) => {
    const bcrypt = require('bcrypt');
    return bcrypt.compareSync(password, hashedPassword);
}

module.exports = {
    hashPassword,
    comparePassword
};