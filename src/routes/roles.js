const express = require("express");
const controller = require("../controllers/roles");

const router = express.Router();
router.use(controller);

module.exports = router;
