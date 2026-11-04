const express = require("express");
const {
  getRoles,
  getRoleDetail,
  createRole,
  updateRole,
  deleteRole,
} = require("../controllers/roles");

const router = express.Router();
router.get("/", getRoles);
router.get("/detail/:id", getRoleDetail);
router.post("/create", createRole);
router.put("/update/:id", updateRole);
router.delete("/delete/:id", deleteRole);

module.exports = router;
