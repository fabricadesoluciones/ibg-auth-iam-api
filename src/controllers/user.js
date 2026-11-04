const express = require("express");
const { Op, col, cast, where } = require("sequelize");
const bcrypt = require("bcryptjs");
const { assertDatabaseConfigured } = require("../database");
const { User, Role, Company, UserCompany } = require("../models");

const router = express.Router();
const userAttributes = ["id", "name", "role_id", "email", "status", "temporary_password", "email_verified_at", "password_reset_attempts", "last_failed_login", "is_ldap", "microsoft_payload", "mfa_enabled", "is_active"];
const text = (value) => String(value ?? "").trim();
const positiveInt = (value, fallback) => {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const optionalPositiveInt = (value) => {
  const parsed = Number.parseInt(text(value), 10);
  return text(value) && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const flag = (value) => {
  const normalized = text(value).toLowerCase();
  if (["si", "sí", "yes", "true", "1"].includes(normalized)) return true;
  if (["no", "false", "0"].includes(normalized)) return false;
  return null;
};
const serialize = (user) => ({
  id: user.id,
  name: user.name,
  role_id: user.role_id,
  email: user.email,
  status: user.status,
  temporary_password: user.temporary_password,
  email_verified_at: user.email_verified_at,
  password_reset_attempts: user.password_reset_attempts,
  last_failed_login: user.last_failed_login,
  is_ldap: user.is_ldap,
  microsoft_payload: user.microsoft_payload,
  mfa_enabled: user.mfa_enabled,
  is_active: user.is_active,
  companyIds: (user.companies || []).map((company) => Number(company.id)).filter(Number.isInteger),
});
const companyInclude = { model: Company, as: "companies", attributes: ["id"], through: { attributes: [] }, required: false };
const normalizeCompanyIds = (value) => [...new Set((Array.isArray(value) ? value : [])
  .map(Number).filter((id) => Number.isInteger(id) && id > 0))];
const loadUser = (id, options = {}) => User.findByPk(id, { attributes: userAttributes, include: [companyInclude], ...options });
const replaceCompanies = async (userId, companyIds, transaction) => {
  const existing = await Company.findAll({ where: { id: { [Op.in]: companyIds } }, attributes: ["id"], transaction });
  if (existing.length !== companyIds.length) {
    const error = new Error("Una o mas empresas no existen"); error.statusCode = 400; throw error;
  }
  await UserCompany.destroy({ where: { user_id: userId }, transaction });
  if (companyIds.length) await UserCompany.bulkCreate(companyIds.map((company_id) => ({ user_id: userId, company_id })), { transaction });
};

router.get("/", async (req, res, next) => {
  try {
    assertDatabaseConfigured();
    const query = req.query;
    const page = positiveInt(query.page, 1);
    const limit = Math.min(positiveInt(query.limit, 10), 100);
    const sortField = ["id", "name", "email"].includes(String(query.sortField)) ? String(query.sortField) : "id";
    const sortOrder = String(query.sortOrder ?? "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
    const and = [];
    const search = text(query.search);
    const roleFilter = text(query.role);
    const companyFilter = text(query.company);
    const companyId = optionalPositiveInt(query.company);

    const findRoleIds = async (term) => (await Role.findAll({
      attributes: ["id"], where: { name: { [Op.like]: `%${term}%` } }, raw: true,
    })).map((role) => Number(role.id)).filter(Number.isFinite);

    const filters = {};
    if (search) {
      const roleIds = await findRoleIds(search);
      filters[Op.or] = [
        { name: { [Op.like]: `%${search}%` } }, { email: { [Op.like]: `%${search}%` } },
        where(cast(col("users.id"), "CHAR"), { [Op.like]: `%${search}%` }),
        where(cast(col("users.role_id"), "CHAR"), { [Op.like]: `%${search}%` }),
        ...(roleIds.length ? [{ role_id: { [Op.in]: roleIds } }] : []),
      ];
    }
    if (text(query.id)) and.push(where(cast(col("users.id"), "CHAR"), { [Op.like]: `%${text(query.id)}%` }));
    if (text(query.name)) and.push({ name: { [Op.like]: `%${text(query.name)}%` } });
    if (text(query.email)) and.push({ email: { [Op.like]: `%${text(query.email)}%` } });
    if (roleFilter) {
      const roleIds = await findRoleIds(roleFilter);
      and.push(roleIds.length ? { role_id: { [Op.in]: roleIds } } : { role_id: -1 });
    }
    const interno = flag(query.interno);
    const proveedor = flag(query.proveedor);
    const activo = flag(query.activo);
    if (interno !== null) and.push({ is_ldap: interno ? 1 : 0 });
    if (proveedor !== null) and.push({ is_ldap: proveedor ? 0 : 1, mfa_enabled: proveedor ? 1 : { [Op.in]: [0, false] } });
    if (activo !== null) and.push({ is_active: activo ? 1 : 0 });
    if (and.length) filters[Op.and] = and;

    const companyInclude = {
      model: Company, as: "companies", attributes: ["id"], through: { attributes: [] }, required: Boolean(companyFilter),
      ...(companyFilter ? { where: { [Op.or]: [
        { legal_name: { [Op.like]: `%${companyFilter}%` } },
        ...(companyId ? [{ id: companyId }] : []),
      ] } } : {}),
    };
    const { count, rows } = await User.findAndCountAll({
      attributes: userAttributes, include: [companyInclude], where: filters,
      order: [[sortField, sortOrder]], limit, offset: (page - 1) * limit, distinct: true,
    });
    res.json({
      code: rows.length ? 1 : -1,
      message: rows.length ? "Success" : "No Content",
      data: rows.map(serialize),
      meta: { page, limit, total: count, totalPages: Math.max(1, Math.ceil(count / limit)) },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/deleted", async (req, res, next) => {
  try {
    assertDatabaseConfigured();
    const page = positiveInt(req.query.page, 1);
    const limit = Math.min(positiveInt(req.query.limit, 10), 100);
    const sortField = ["id", "name", "email"].includes(String(req.query.sortField)) ? String(req.query.sortField) : "id";
    const sortOrder = String(req.query.sortOrder ?? "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
    const { count, rows } = await User.findAndCountAll({
      attributes: userAttributes, include: [companyInclude], paranoid: false,
      where: { deleted_at: { [Op.ne]: null } }, order: [[sortField, sortOrder]],
      limit, offset: (page - 1) * limit, distinct: true,
    });
    res.json({ code: rows.length ? 1 : -1, message: rows.length ? "Success" : "No Content", data: rows.map(serialize), meta: { page, limit, total: count, totalPages: Math.max(1, Math.ceil(count / limit)) } });
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    assertDatabaseConfigured();
    const id = positiveInt(req.params.id, null);
    if (!id) {
      return res.status(400).json({ code: -1, message: "Id de usuario invalido", data: {} });
    }
    const user = await User.findByPk(id, {
      attributes: userAttributes,
      include: [{ model: Company, as: "companies", attributes: ["id"], through: { attributes: [] }, required: false }],
      // Matches the legacy detail endpoint, which can retrieve soft-deleted users.
      paranoid: false,
    });
    if (!user) {
      return res.status(404).json({ code: -1, message: "Usuario no encontrado", data: {} });
    }
    return res.json({ code: 1, message: "Success", data: serialize(user) });
  } catch (error) {
    next(error);
  }
});

router.post("/create", async (req, res, next) => {
  try {
    assertDatabaseConfigured();
    const { name, email, role_id, is_ldap = false, mfa_enabled = false, is_active = true } = req.body || {};
    if (!text(name) || !text(email) || !positiveInt(role_id, null)) {
      return res.status(400).json({ code: -1, message: "Se requiere nombre, correo, y rol." });
    }
    const normalizedEmail = text(email).toLowerCase();
    if (await User.findOne({ where: { email: normalizedEmail } })) return res.status(409).json({ code: -1, message: "El email ya esta registrado" });
    if (!await Role.findByPk(role_id)) return res.status(400).json({ code: -1, message: "El rol seleccionado no existe" });
    const companyIds = normalizeCompanyIds(req.body.companyIds);
    const user = await User.sequelize.transaction(async (transaction) => {
      const created = await User.create({ name: text(name), email: normalizedEmail, role_id: Number(role_id), is_ldap: Boolean(is_ldap), mfa_enabled: Boolean(mfa_enabled), is_active: Boolean(is_active), status: Boolean(is_active) ? "active" : "inactive", temporary_password: false }, { transaction });
      await replaceCompanies(created.id, companyIds, transaction);
      return loadUser(created.id, { transaction });
    });
    res.status(201).json({ code: 1, message: "Success", data: serialize(user) });
  } catch (error) { next(error); }
});

router.put("/update/:id", async (req, res, next) => {
  try {
    assertDatabaseConfigured();
    const id = positiveInt(req.params.id, null);
    if (!id) return res.status(400).json({ code: -1, message: "Id de usuario invalido", data: {} });
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ code: -1, message: "No encontrado", data: {} });
    const body = req.body || {};
    if (body.role_id !== undefined && !await Role.findByPk(body.role_id)) return res.status(400).json({ code: -1, message: "El rol seleccionado no existe" });
    const updates = {};
    for (const key of ["name", "role_id", "is_ldap", "mfa_enabled", "is_active"]) if (body[key] !== undefined) updates[key] = key === "name" ? text(body[key]) : body[key];
    if (body.email !== undefined) updates.email = text(body.email).toLowerCase();
    if (updates.is_active !== undefined && !user.temporary_password) updates.status = updates.is_active ? "active" : "inactive";
    const updated = await User.sequelize.transaction(async (transaction) => {
      await user.update(updates, { transaction });
      if (body.companyIds !== undefined) await replaceCompanies(id, normalizeCompanyIds(body.companyIds), transaction);
      return loadUser(id, { transaction });
    });
    res.json({ code: 1, message: "Success", data: serialize(updated) });
  } catch (error) { next(error); }
});

router.delete("/delete/:id", async (req, res, next) => {
  try {
    assertDatabaseConfigured(); const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ code: -1, message: "No encontrado", data: {} });
    await user.destroy(); res.json({ code: 1, message: "Success", data: null });
  } catch (error) { next(error); }
});

router.put("/restore/:id", async (req, res, next) => {
  try {
    assertDatabaseConfigured(); const user = await User.findByPk(req.params.id, { paranoid: false });
    if (!user) return res.status(404).json({ code: -1, message: "No encontrado", data: {} });
    await user.restore(); const restored = await loadUser(user.id); res.json({ code: 1, message: "Success", data: serialize(restored) });
  } catch (error) { next(error); }
});

router.put("/reset-password/:id", async (req, res, next) => {
  try {
    assertDatabaseConfigured(); const password = text(req.body?.password);
    if (password.length < 6) return res.status(400).json({ code: -1, message: "La contrasena debe tener al menos 6 caracteres" });
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ code: -1, message: "Usuario no encontrado" });
    if (user.is_ldap) return res.status(400).json({ code: -1, message: "No se puede resetear la contrasena de un usuario LDAP" });
    await user.update({ password_hash: await bcrypt.hash(password, 10), temporary_password: false, status: user.is_active ? "active" : "inactive", password_reset_attempts: 0, last_failed_login: null });
    res.json({ code: 1, message: "Contrasena actualizada correctamente", data: { id: user.id } });
  } catch (error) { next(error); }
});

module.exports = router;
