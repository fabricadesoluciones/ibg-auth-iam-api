const express = require("express");
const controller = require("../controllers/providers");

const router = express.Router();
router.use(controller);

module.exports = router;
