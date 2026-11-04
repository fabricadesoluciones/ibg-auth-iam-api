const express = require("express");
const {
  getUsers,
  getDeletedUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  restoreUser,
  resetUserPassword,
} = require("../controllers/user");

const router = express.Router();
router.get("/", getUsers);
router.get("/deleted", getDeletedUsers);
router.get("/:id", getUserById);
router.post("/create", createUser);
router.put("/update/:id", updateUser);
router.delete("/delete/:id", deleteUser);
router.put("/restore/:id", restoreUser);
router.put("/reset-password/:id", resetUserPassword);

module.exports = router;
