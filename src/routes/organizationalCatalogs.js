const express = require("express");
const {
  snapshot,
  listAreas,
  createArea,
  updateArea,
  deleteArea,
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listPositions,
  createPosition,
  updatePosition,
  deletePosition,
} = require("../controllers/organizationalCatalogs");

const router = express.Router();

router.get("/", snapshot);
router.get("/snapshot", snapshot);
router.get("/areas", listAreas);
router.post("/areas", createArea);
router.put("/areas/:id", updateArea);
router.delete("/areas/:id", deleteArea);
router.get("/departments", listDepartments);
router.post("/departments", createDepartment);
router.put("/departments/:id", updateDepartment);
router.delete("/departments/:id", deleteDepartment);
router.get("/positions", listPositions);
router.post("/positions", createPosition);
router.put("/positions/:id", updatePosition);
router.delete("/positions/:id", deletePosition);

module.exports = router;
