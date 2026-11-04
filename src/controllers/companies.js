const { assertDatabaseConfigured } = require("../database");
const { Op } = require("sequelize");
const { Company } = require("../models");

const fail = (message, statusCode) =>
  Object.assign(new Error(message), { statusCode });
const serializeCompany = (company) => ({
  id: Number(company.id),
  tax_id: company.tax_id,
  legal_name: company.legal_name,
  description: company.description,
  is_active: company.is_active,
});

const getCompanies = async (_req, res, next) => {
  try {
    assertDatabaseConfigured();
    const companies = await Company.findAll({
      attributes: ["id", "tax_id", "legal_name", "description", "is_active"],
      where: { is_active: true },
      order: [["legal_name", "ASC"]],
    });

    res.json({
      code: companies.length ? 1 : -1,
      message: companies.length ? "Success" : "No Content",
      data: companies.map((company) => ({
        id: Number(company.id),
        name: company.legal_name,
        rfc: company.tax_id,
        description: company.description,
        is_active: company.is_active,
      })),
    });
  } catch (error) {
    next(error);
  }
};

const createCompany = async (req, res, next) => {
  try {
    assertDatabaseConfigured();
    const {
      tax_id,
      legal_name,
      description = null,
      is_active = true,
    } = req.body || {};
    if (!tax_id || !legal_name) {
      throw fail("Los campos tax_id y legal_name son obligatorios", 400);
    }

    const normalizedTaxId = String(tax_id).trim().toUpperCase();
    const normalizedLegalName = String(legal_name).trim();
    if (!normalizedTaxId || !normalizedLegalName) {
      throw fail("Los campos tax_id y legal_name son obligatorios", 400);
    }
    const normalizedDescription =
      description === null || String(description).trim() === ""
        ? null
        : String(description).trim();

    const existing = await Company.findOne({
      where: { tax_id: normalizedTaxId },
    });
    if (existing) throw fail("Ya existe una empresa con ese tax_id", 409);

    const company = await Company.create({
      tax_id: normalizedTaxId,
      legal_name: normalizedLegalName,
      description: normalizedDescription,
      is_active: Boolean(is_active),
    });
    res.status(201).json({
      code: 1,
      message: "Empresa creada correctamente",
      data: serializeCompany(company),
    });
  } catch (error) {
    next(error);
  }
};

const updateCompany = async (req, res, next) => {
  try {
    assertDatabaseConfigured();
    const company = await Company.findByPk(req.params.id);
    if (!company) throw fail("Empresa no encontrada", 404);

    const { tax_id, legal_name, description, is_active } = req.body || {};
    const updates = {};
    if (tax_id !== undefined) {
      const normalizedTaxId = String(tax_id).trim().toUpperCase();
      if (!normalizedTaxId)
        throw fail("El campo tax_id no puede estar vacio", 400);
      const existing = await Company.findOne({
        where: { tax_id: normalizedTaxId, id: { [Op.ne]: company.id } },
      });
      if (existing) throw fail("Ya existe una empresa con ese tax_id", 409);
      updates.tax_id = normalizedTaxId;
    }
    if (legal_name !== undefined) {
      const normalizedLegalName = String(legal_name).trim();
      if (!normalizedLegalName)
        throw fail("El campo legal_name no puede estar vacio", 400);
      updates.legal_name = normalizedLegalName;
    }
    if (description !== undefined) {
      updates.description =
        description === null || String(description).trim() === ""
          ? null
          : String(description).trim();
    }
    if (is_active !== undefined) updates.is_active = Boolean(is_active);

    await company.update(updates);
    res.json({
      code: 1,
      message: "Empresa actualizada correctamente",
      data: serializeCompany(company),
    });
  } catch (error) {
    next(error);
  }
};

const deleteCompany = async (req, res, next) => {
  try {
    assertDatabaseConfigured();
    const company = await Company.findByPk(req.params.id);
    if (!company) throw fail("Empresa no encontrada", 404);

    await company.update({ is_active: false });
    await company.destroy();
    res.json({
      code: 1,
      message: "Empresa eliminada correctamente",
      data: { id: Number(company.id) },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCompanies, createCompany, updateCompany, deleteCompany };
