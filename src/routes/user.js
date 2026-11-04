const express = require("express");
const controller = require("../controllers/user");

const router = express.Router();
router.use(controller);

module.exports = router;
