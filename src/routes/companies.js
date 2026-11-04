const express = require("express");
const { getCompanies } = require("../controllers/companies");

const router = express.Router();
router.get("/", getCompanies);

module.exports = router;
