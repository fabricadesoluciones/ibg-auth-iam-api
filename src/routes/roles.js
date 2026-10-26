const express = require("express");
const { Op } = require("sequelize");
const { assertDatabaseConfigured } = require("../database");
const { Area, Department, Position, Role, RolePermission, User } = require("../models");

const router = express.Router();
const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const roleAttributes = ["id", "name", "description", "area_id", "department_id", "position_id"];
const includes = [{ model: Area, as: "area", attributes: ["id", "name"] }, { model: Department, as: "department", attributes: ["id", "name"] }, { model: Position, as: "position", attributes: ["id", "name"] }];
const serialize = (role) => ({ id: Number(role.id), name: role.name, description: role.description, area_id: Number(role.area_id), department_id: Number(role.department_id), position_id: Number(role.position_id), area_name: role.area?.name ?? null, department_name: role.department?.name ?? null, position_name: role.position?.name ?? null });
const normalizePermissions = (permissions) => (Array.isArray(permissions) ? permissions : []).map((permission) => {
  const value = typeof permission === "object" && permission ? permission : { permission_id: permission }; const permission_id = Number(value.permission_id);
  return Number.isFinite(permission_id) ? { permission_id, create_permission: Boolean(value.create_permission), update_permission: Boolean(value.update_permission), delete_permission: Boolean(value.delete_permission), synchronize_permission: Boolean(value.synchronize_permission), view_permission: value.view_permission === undefined ? true : Boolean(value.view_permission) } : null;
}).filter(Boolean);
const permissionsFor = async (roleId, transaction) => (await RolePermission.findAll({ where: { role_id: roleId }, attributes: ["permission_id", "create_permission", "update_permission", "delete_permission", "synchronize_permission", "view_permission"], raw: true, transaction })).map((permission) => ({ ...permission, permission_id: Number(permission.permission_id), create_permission: Boolean(permission.create_permission), update_permission: Boolean(permission.update_permission), delete_permission: Boolean(permission.delete_permission), synchronize_permission: Boolean(permission.synchronize_permission), view_permission: Boolean(permission.view_permission) }));
const validateScope = async (body, roleId, transaction) => {
  const payload = { name: String(body.name ?? "").trim(), description: String(body.description ?? "").trim() || null, area_id: Number(body.area_id), department_id: Number(body.department_id), position_id: Number(body.position_id) };
  if (!payload.name || !payload.area_id || !payload.department_id || !payload.position_id) throw Object.assign(new Error("Nombre, area, departamento y puesto son obligatorios"), { statusCode: 400 });
  const [area, department, position] = await Promise.all([Area.findByPk(payload.area_id, { transaction }), Department.findByPk(payload.department_id, { transaction }), Position.findByPk(payload.position_id, { transaction })]);
  if (!area || !department || !position || Number(department.area_id) !== payload.area_id || Number(position.area_id) !== payload.area_id || Number(position.department_id) !== payload.department_id) throw Object.assign(new Error("El alcance del rol no es valido"), { statusCode: 400 });
  const duplicate = await Role.findOne({ where: { name: payload.name, area_id: payload.area_id, department_id: payload.department_id, position_id: payload.position_id, ...(roleId ? { id: { [Op.ne]: roleId } } : {}) }, paranoid: false, transaction });
  if (duplicate) throw Object.assign(new Error("Ya existe un rol con el mismo alcance y nombre"), { statusCode: 400 }); return payload;
};

router.get("/", async (req, res, next) => {
  try {
    assertDatabaseConfigured();
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 10), 100);
    const search = String(req.query.search ?? "").trim();
    const sortOrder = String(req.query.sortOrder ?? "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
    const where = search ? { [Op.or]: [
      { name: { [Op.like]: `%${search}%` } },
      { description: { [Op.like]: `%${search}%` } },
    ] } : undefined;
    const { count, rows } = await Role.findAndCountAll({
      attributes: ["id", "name", "description", "area_id", "department_id", "position_id"],
      include: [
        { model: Area, as: "area", attributes: ["id", "name"] },
        { model: Department, as: "department", attributes: ["id", "name"] },
        { model: Position, as: "position", attributes: ["id", "name"] },
      ],
      where,
      order: [["name", sortOrder]],
      limit,
      offset: (page - 1) * limit,
    });
    res.json({
      code: rows.length ? 1 : -1,
      message: rows.length ? "Success" : "No Content",
      data: rows.map((role) => ({
        id: Number(role.id), name: role.name, description: role.description,
        area_id: Number(role.area_id), department_id: Number(role.department_id), position_id: Number(role.position_id),
        area_name: role.area?.name ?? null, department_name: role.department?.name ?? null, position_name: role.position?.name ?? null,
      })),
      meta: { page, limit, total: count, totalPages: Math.max(1, Math.ceil(count / limit)) },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/detail/:id", async (req, res, next) => { try { assertDatabaseConfigured(); const role = await Role.findByPk(req.params.id, { attributes: roleAttributes, include: includes }); if (!role) return res.status(404).json({ code: -1, message: "Rol no encontrado" }); res.json({ code: 1, data: { ...serialize(role), permissions: await permissionsFor(role.id) } }); } catch (error) { next(error); } });
router.post("/create", async (req, res, next) => { try { assertDatabaseConfigured(); const role = await Role.sequelize.transaction(async (transaction) => { const created = await Role.create(await validateScope(req.body || {}, null, transaction), { transaction }); const permissions = normalizePermissions(req.body?.permissions).map((permission) => ({ ...permission, role_id: created.id })); if (permissions.length) await RolePermission.bulkCreate(permissions, { transaction }); return created; }); res.status(201).json({ code: 1, message: "Guardado correctamente", id: role.id }); } catch (error) { next(error); } });
router.put("/update/:id", async (req, res, next) => { try { assertDatabaseConfigured(); const id = Number(req.params.id); const role = await Role.sequelize.transaction(async (transaction) => { const found = await Role.findByPk(id, { transaction }); if (!found) throw Object.assign(new Error("Rol no encontrado"), { statusCode: 404 }); await found.update(await validateScope(req.body || {}, id, transaction), { transaction }); if (Array.isArray(req.body?.permissions)) { await RolePermission.destroy({ where: { role_id: id }, transaction }); const permissions = normalizePermissions(req.body.permissions).map((permission) => ({ ...permission, role_id: id })); if (permissions.length) await RolePermission.bulkCreate(permissions, { transaction }); } return found; }); res.json({ code: 1, message: "Rol actualizado correctamente", id: role.id }); } catch (error) { next(error); } });
router.delete("/delete/:id", async (req, res, next) => { try { assertDatabaseConfigured(); const id = Number(req.params.id); if (id === 1) return res.status(400).json({ code: -1, message: "El rol administrador no se puede eliminar." }); const role = await Role.findByPk(id); if (!role) return res.status(404).json({ code: -1, message: "Rol no encontrado" }); if (await User.count({ where: { role_id: id } })) return res.status(400).json({ code: -1, message: "No se puede eliminar el rol porque tiene usuarios asignados." }); await role.destroy(); res.json({ code: 1, message: "Rol eliminado correctamente" }); } catch (error) { next(error); } });

module.exports = router;
