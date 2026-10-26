const express = require("express");
const { assertDatabaseConfigured } = require("../database");
const { Op } = require("sequelize");
const { Area, Department, Position, Role } = require("../models");

const router = express.Router();

const snapshot = async (_req, res, next) => {
  try {
    assertDatabaseConfigured();
    const [areas, departments, positions] = await Promise.all([
      Area.findAll({ attributes: ["id", "name", "description"], order: [["name", "ASC"]] }),
      Department.findAll({ attributes: ["id", "name", "description", "area_id"], order: [["name", "ASC"]] }),
      Position.findAll({ attributes: ["id", "name", "description", "area_id", "department_id"], order: [["name", "ASC"]] }),
    ]);
    res.json({ code: 1, data: { areas, departments, positions } });
  } catch (error) {
    next(error);
  }
};

// The legacy API exposed the snapshot at /snapshot.  The root alias supports
// consumers already calling /organizationalCatalogs during the migration.
router.get("/", snapshot);
router.get("/snapshot", snapshot);

const id = (value) => { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; };
const payload = (body = {}) => ({ name: String(body.name ?? "").trim(), description: String(body.description ?? "").trim() || null });
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const catalog = {
  area: { Model: Area, label: "area", attrs: ["id", "name", "description"] },
  department: { Model: Department, label: "departamento", attrs: ["id", "name", "description", "area_id"] },
  position: { Model: Position, label: "puesto", attrs: ["id", "name", "description", "area_id", "department_id"] },
};
const ensure = async (Model, value, label) => { const record = await Model.findByPk(value); if (!record) throw fail(`${label} no encontrado`, 404); return record; };
const verifyScope = async (type, body) => {
  const area_id = type === "area" ? null : id(body.area_id);
  const department_id = type === "position" ? id(body.department_id) : null;
  if (type !== "area" && !area_id) throw fail("El area es obligatoria");
  if (type === "position" && !department_id) throw fail("El departamento es obligatorio");
  if (area_id) await ensure(Area, area_id, "Area");
  if (department_id) { const department = await ensure(Department, department_id, "Departamento"); if (Number(department.area_id) !== area_id) throw fail("El departamento seleccionado no pertenece al area indicada"); }
  return { ...(area_id ? { area_id } : {}), ...(department_id ? { department_id } : {}) };
};
const duplicateWhere = (type, values, excludeId) => ({ name: values.name, ...(type === "department" ? { area_id: values.area_id } : {}), ...(type === "position" ? { department_id: values.department_id } : {}), ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}) });
const list = (type) => async (req, res, next) => {
  try { assertDatabaseConfigured(); const { Model, attrs } = catalog[type]; const where = { ...(req.query.search ? { name: { [Op.like]: `%${String(req.query.search).trim()}%` } } : {}), ...(type !== "area" && id(req.query.area_id) ? { area_id: id(req.query.area_id) } : {}), ...(type === "position" && id(req.query.department_id) ? { department_id: id(req.query.department_id) } : {}) }; res.json({ code: 1, data: await Model.findAll({ attributes: attrs, where, order: [["name", "ASC"]] }) }); } catch (error) { next(error); }
};
const create = (type) => async (req, res, next) => {
  try { assertDatabaseConfigured(); const { Model, label } = catalog[type]; const data = payload(req.body); if (!data.name) throw fail(`El nombre del ${label} es obligatorio`); const scope = await verifyScope(type, req.body || {}); const existing = await Model.findOne({ where: duplicateWhere(type, { ...data, ...scope }), paranoid: false }); if (existing) { if (existing.deleted_at) { await existing.restore(); await existing.update({ ...scope, ...data }); return res.json({ code: 1, message: `${label} recuperado correctamente`, data: existing }); } throw fail(`Ya existe un ${label} con ese nombre`); } const created = await Model.create({ ...scope, ...data }); res.status(201).json({ code: 1, message: `${label} creado correctamente`, data: created }); } catch (error) { next(error); }
};
const update = (type) => async (req, res, next) => {
  try { assertDatabaseConfigured(); const recordId = id(req.params.id); if (!recordId) throw fail(`${catalog[type].label} invalido`); const { Model, label } = catalog[type]; const data = payload(req.body); if (!data.name) throw fail(`El nombre del ${label} es obligatorio`); const scope = await verifyScope(type, req.body || {}); const record = await ensure(Model, recordId, label); if (await Model.findOne({ where: duplicateWhere(type, { ...data, ...scope }, recordId), paranoid: false })) throw fail(`Ya existe un ${label} con ese nombre`); await record.update({ ...scope, ...data }); res.json({ code: 1, message: `${label} actualizado correctamente`, data: record }); } catch (error) { next(error); }
};
const remove = (type) => async (req, res, next) => {
  try { assertDatabaseConfigured(); const recordId = id(req.params.id); if (!recordId) throw fail(`${catalog[type].label} invalido`); const { Model, label } = catalog[type]; const record = await ensure(Model, recordId, label); const related = type === "area" ? await Promise.all([Department.count({ where: { area_id: recordId } }), Role.count({ where: { area_id: recordId } })]).then(([a, b]) => a + b) : type === "department" ? await Promise.all([Position.count({ where: { department_id: recordId } }), Role.count({ where: { department_id: recordId } })]).then(([a, b]) => a + b) : await Role.count({ where: { position_id: recordId } }); if (related) throw fail(`No se puede eliminar el ${label} porque tiene registros relacionados`); await record.destroy(); res.json({ code: 1, message: `${label} eliminado correctamente` }); } catch (error) { next(error); }
};

router.get("/areas", list("area"));
router.post("/areas", create("area"));
router.put("/areas/:id", update("area"));
router.delete("/areas/:id", remove("area"));
router.get("/departments", list("department"));
router.post("/departments", create("department"));
router.put("/departments/:id", update("department"));
router.delete("/departments/:id", remove("department"));
router.get("/positions", list("position"));
router.post("/positions", create("position"));
router.put("/positions/:id", update("position"));
router.delete("/positions/:id", remove("position"));

module.exports = router;
