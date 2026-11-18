const express = require("express");
const { executeUserRolesMigration } = require("../controllers/migrations");

const router = express.Router();
router.get("/migrations/user-roles", executeUserRolesMigration);

module.exports = router;
