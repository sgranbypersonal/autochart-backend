const express = require("express");
const router = express.Router();
const {
  createNurse,
  getNurses,
  getMyNurses,
  getAllNurses,
  getSingleNurse,
  updateNurseById,
  deleteNurseById,
  bulkDeleteNurses,
  createMultipleNurses,
} = require("../controllers/nurseController");
const { verifyToken, checkRole } = require("../middlewares/verifyToken");

router.post("/", verifyToken, checkRole(["superadmin", "admin"]), createNurse);
router.get("/", verifyToken, getNurses);
router.get("/myNurses", verifyToken, getMyNurses);
router.get("/allNurses", verifyToken, getAllNurses);
router.get("/:id", verifyToken, getSingleNurse);
router.put(
  "/:id",
  verifyToken,
  (req, res, next) => {
    if (req.user.role === "nurse" && req.user.userId !== req.params.id) {
      return res
        .status(403)
        .json({ error: "Nurses can only edit their own profile" });
    }
    next();
  },
  updateNurseById
);
router.delete(
  "/:id",
  verifyToken,
  checkRole(["superadmin", "admin"]),
  deleteNurseById
);
router.delete(
  "/bulk",
  verifyToken,
  checkRole(["superadmin", "admin"]),
  bulkDeleteNurses
);
router.post(
  "/batch",
  verifyToken,
  checkRole(["superadmin", "admin"]),
  createMultipleNurses
);

module.exports = router;
