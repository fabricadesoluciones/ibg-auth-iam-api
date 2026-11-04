const express = require("express");
const controller = require("../controllers/auth");

const router = express.Router();
router.use(controller);

module.exports = router;
