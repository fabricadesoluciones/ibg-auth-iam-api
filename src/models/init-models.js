const { DataTypes } = require("sequelize");
const defineArea = require("./areas");
const defineCompany = require("./companies");
const defineDepartment = require("./departments");
const definePasswordResetToken = require("./password_reset_tokens");
const definePosition = require("./positions");
const defineRole = require("./roles");
const defineRolePermission = require("./role_permissions");
const defineUser = require("./users");
const defineUserCompany = require("./user_companies");
const defineUserPermission = require("./user_permissions");
const defineUserSession = require("./user_sessions");

const initModels = (sequelize) => {
  const Area = defineArea(sequelize, DataTypes);
  const Company = defineCompany(sequelize, DataTypes);
  const Department = defineDepartment(sequelize, DataTypes);
  const PasswordResetToken = definePasswordResetToken(sequelize, DataTypes);
  const Position = definePosition(sequelize, DataTypes);
  const Role = defineRole(sequelize, DataTypes);
  const RolePermission = defineRolePermission(sequelize, DataTypes);
  const User = defineUser(sequelize, DataTypes);
  const UserCompany = defineUserCompany(sequelize, DataTypes);
  const UserPermission = defineUserPermission(sequelize, DataTypes);
  const UserSession = defineUserSession(sequelize, DataTypes);

  Department.belongsTo(Area, { as: "area", foreignKey: "area_id" });
  Area.hasMany(Department, { as: "departments", foreignKey: "area_id" });
  Position.belongsTo(Area, { as: "area", foreignKey: "area_id" });
  Position.belongsTo(Department, {
    as: "department",
    foreignKey: "department_id",
  });
  Area.hasMany(Position, { as: "positions", foreignKey: "area_id" });
  Department.hasMany(Position, {
    as: "positions",
    foreignKey: "department_id",
  });
  Role.belongsTo(Area, { as: "area", foreignKey: "area_id" });
  Role.belongsTo(Department, { as: "department", foreignKey: "department_id" });
  Role.belongsTo(Position, { as: "position", foreignKey: "position_id" });
  Area.hasMany(Role, { as: "roles", foreignKey: "area_id" });
  Department.hasMany(Role, { as: "roles", foreignKey: "department_id" });
  Position.hasMany(Role, { as: "roles", foreignKey: "position_id" });
  User.belongsToMany(Company, {
    as: "companies",
    through: UserCompany,
    foreignKey: "user_id",
    otherKey: "company_id",
  });
  Company.belongsToMany(User, {
    as: "users",
    through: UserCompany,
    foreignKey: "company_id",
    otherKey: "user_id",
  });
  User.hasMany(UserPermission, { as: "permission_assignments", foreignKey: "user_id" });
  UserPermission.belongsTo(User, { as: "user", foreignKey: "user_id" });

  return {
    Area,
    Company,
    Department,
    PasswordResetToken,
    Position,
    Role,
    RolePermission,
    User,
    UserCompany,
    UserPermission,
    UserSession,
  };
};

module.exports = { initModels };
