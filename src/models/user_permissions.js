const Sequelize = require("sequelize");

class user_permissions extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init(
      {
        id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
        permission_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      },
      { sequelize, tableName: "user_permissions", timestamps: true, paranoid: true, createdAt: "created_at", updatedAt: "updated_at", deletedAt: "deleted_at" },
    );
  }
}

module.exports = (sequelize, DataTypes) => user_permissions.init(sequelize, DataTypes);
