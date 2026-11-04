const { sequelize } = require("./connection");
const { initModels } = require("./init-models");

module.exports = initModels(sequelize);
