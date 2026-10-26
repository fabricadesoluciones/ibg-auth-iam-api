const { Sequelize } = require("sequelize");

// MySQL may legitimately be configured without a password in local development.
const required = ["DB_NAME", "DB_USER", "DB_HOST"];
const missing = () => required.filter((key) => !process.env[key]);

const sequelize = new Sequelize(
  process.env.DB_NAME || "ibg",
  process.env.DB_USER || "root",
  process.env.DB_PWD || "",
  {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    dialect: "mysql",
    logging: false,
    pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
  }
);

const assertDatabaseConfigured = () => {
  const keys = missing();
  if (keys.length) {
    const error = new Error(`Faltan variables de base de datos: ${keys.join(", ")}`);
    error.statusCode = 503;
    throw error;
  }
};

module.exports = { sequelize, assertDatabaseConfigured };
