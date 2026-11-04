const express = require("express");
const controller = require("../controllers/organizationalCatalogs");

const router = express.Router();
router.use(controller);

module.exports = router;
