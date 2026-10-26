const express = require("express");
const { assertDatabaseConfigured } = require("../database");
const { Company } = require("../models");

const router = express.Router();

router.get("/", async (req, res, next) => {
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
});

module.exports = router;
