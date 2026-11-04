const express = require("express");
const { resetProviderPassword } = require("../controllers/providers");

const router = express.Router();
router.post("/:id/reset-password", resetProviderPassword);

module.exports = router;
