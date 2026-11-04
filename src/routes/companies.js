const express = require("express");
const controller = require("../controllers/companies");

const router = express.Router();
router.use(controller);

module.exports = router;
