const { sequelize } = require("../models/connection");
const userRolesMigration = require("../../migrations/20261112000100-create-user-roles");

const executeUserRolesMigration = async (req, res, next) => {
  try {
    const environment = `${process.env.NODE_ENV || ""} ${process.env.APP_ENV || ""} ${process.env.ENVIRONMENT || ""}`.toLowerCase();
    if (/production|prod/.test(environment)) {
      return res.status(404).json({ code: -1, message: "Ruta no disponible" });
    }
    await userRolesMigration.up(sequelize.getQueryInterface());
    return res.json({ code: 1, message: "Migración user_roles aplicada correctamente" });
  } catch (error) {
    next(error);
  }
};

module.exports = { executeUserRolesMigration };
