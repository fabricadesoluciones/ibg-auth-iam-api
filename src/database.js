const { sequelize } = require("./models/connection");

// MySQL may legitimately be configured without a password in local development.
const required = ["DB_NAME", "DB_USER", "DB_HOST"];
const missing = () => required.filter((key) => !process.env[key]);

const assertDatabaseConfigured = () => {
  const keys = missing();
  if (keys.length) {
    const error = new Error(
      `Faltan variables de base de datos: ${keys.join(", ")}`,
    );
    error.statusCode = 503;
    throw error;
  }
};

module.exports = { sequelize, assertDatabaseConfigured };
