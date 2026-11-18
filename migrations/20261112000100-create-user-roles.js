"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS user_roles (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      role_id INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB`);
    await queryInterface.sequelize.query("INSERT IGNORE INTO user_roles (user_id, role_id, created_at, updated_at) SELECT id, role_id, NOW(), NOW() FROM users WHERE role_id IS NOT NULL");
  },
  async down(queryInterface) { await queryInterface.dropTable("user_roles"); },
};
