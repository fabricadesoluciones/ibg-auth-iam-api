const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { assertDatabaseConfigured } = require("../database");
const { User, Role, UserSession } = require("../models");
const router = express.Router();

router.post("/:id/reset-password", async (req, res, next) => {
  try {
    assertDatabaseConfigured(); const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ code: -1, message: "Usuario no encontrado" });
    if (user.is_ldap) return res.status(400).json({ code: -1, message: "No se puede reiniciar la contrasena de un usuario LDAP" });
    const role = await Role.findByPk(user.role_id); const isProvider = Boolean(user.mfa_enabled) || String(role?.name || "").toLowerCase().includes("proveedor");
    if (!isProvider) return res.status(400).json({ code: -1, message: "Solo se puede reiniciar la contrasena de proveedores" });
    const password = crypto.randomBytes(9).toString("base64url");
    await User.sequelize.transaction(async (transaction) => { await user.update({ password_hash: await bcrypt.hash(password, 10), temporary_password: true, status: "pending", activation_token: crypto.randomUUID(), password_reset_attempts: 0, last_failed_login: null }, { transaction }); await UserSession.update({ is_active: false }, { where: { user_id: user.id, is_active: true }, transaction }); });
    res.json({ code: 1, message: "Contrasena reiniciada correctamente." });
  } catch (error) { next(error); }
});
module.exports = router;
