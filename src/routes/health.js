const express = require("express");
const controller = require("../controllers/health");

const router = express.Router();
router.use(controller);

module.exports = router;
