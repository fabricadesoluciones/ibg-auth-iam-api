const { DataTypes } = require("sequelize");
const { sequelize } = require("./database");

const options = (tableName, timestamps = true) => ({
  tableName,
  timestamps,
  paranoid: timestamps,
  createdAt: "created_at",
  updatedAt: "updated_at",
  deletedAt: "deleted_at",
});

const User = sequelize.define("users", {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  role_id: DataTypes.INTEGER,
  name: DataTypes.STRING(150),
  email: DataTypes.STRING(150),
  password_hash: DataTypes.STRING(255),
  status: DataTypes.STRING(20),
  temporary_password: DataTypes.BOOLEAN,
  email_verified_at: DataTypes.DATE,
  activation_token: DataTypes.STRING(255),
  password_reset_attempts: DataTypes.INTEGER,
  last_failed_login: DataTypes.DATE,
  is_ldap: DataTypes.BOOLEAN,
  microsoft_payload: DataTypes.TEXT,
  mfa_enabled: DataTypes.BOOLEAN,
  is_active: DataTypes.BOOLEAN,
}, options("users"));

const UserSession = sequelize.define("user_sessions", {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  user_id: DataTypes.INTEGER,
  session_jwt_token: DataTypes.STRING(512),
  session_mfa_token: DataTypes.STRING(255),
  mfa_code_hash: DataTypes.STRING(255),
  mfa_code_expires_at: DataTypes.DATE,
  mfa_verified_at: DataTypes.DATE,
  is_active: DataTypes.BOOLEAN,
  expires_at: DataTypes.DATE,
}, options("user_sessions"));

const RolePermission = sequelize.define("role_permissions", {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  role_id: DataTypes.INTEGER,
  permission_id: DataTypes.INTEGER,
  create_permission: DataTypes.BOOLEAN,
  update_permission: DataTypes.BOOLEAN,
  delete_permission: DataTypes.BOOLEAN,
  synchronize_permission: DataTypes.BOOLEAN,
  view_permission: DataTypes.BOOLEAN,
}, options("role_permissions", false));

const PasswordResetToken = sequelize.define("password_reset_tokens", {
  email: { type: DataTypes.STRING(150), primaryKey: true },
  token: DataTypes.STRING(255),
  expires_at: DataTypes.DATE,
  used_at: DataTypes.DATE,
}, { tableName: "password_reset_tokens", timestamps: true, createdAt: "created_at", updatedAt: "updated_at" });

const Company = sequelize.define("companies", {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  tax_id: DataTypes.STRING(13),
  legal_name: DataTypes.STRING(255),
  description: DataTypes.TEXT,
  is_active: DataTypes.BOOLEAN,
}, options("companies"));

const Area = sequelize.define("areas", {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  name: DataTypes.STRING(100),
  description: DataTypes.TEXT,
}, options("areas"));

const Department = sequelize.define("departments", {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  area_id: DataTypes.BIGINT.UNSIGNED,
  name: DataTypes.STRING(100),
  description: DataTypes.TEXT,
}, options("departments"));

const Position = sequelize.define("positions", {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  area_id: DataTypes.BIGINT.UNSIGNED,
  department_id: DataTypes.BIGINT.UNSIGNED,
  name: DataTypes.STRING(100),
  description: DataTypes.TEXT,
}, options("positions"));

const Role = sequelize.define("roles", {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  name: DataTypes.STRING(50),
  description: DataTypes.TEXT,
  area_id: DataTypes.BIGINT.UNSIGNED,
  department_id: DataTypes.BIGINT.UNSIGNED,
  position_id: DataTypes.BIGINT.UNSIGNED,
}, options("roles"));

const UserCompany = sequelize.define("user_companies", {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  user_id: DataTypes.BIGINT.UNSIGNED,
  company_id: DataTypes.BIGINT.UNSIGNED,
}, options("user_companies"));

Role.belongsTo(Area, { as: "area", foreignKey: "area_id" });
Role.belongsTo(Department, { as: "department", foreignKey: "department_id" });
Role.belongsTo(Position, { as: "position", foreignKey: "position_id" });
User.belongsToMany(Company, { as: "companies", through: UserCompany, foreignKey: "user_id", otherKey: "company_id" });
Company.belongsToMany(User, { as: "users", through: UserCompany, foreignKey: "company_id", otherKey: "user_id" });

module.exports = {
  User, UserSession, RolePermission, PasswordResetToken,
  Company, Area, Department, Position, Role, UserCompany,
};
