const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const { getMine, createMine, editDay, stopMine } = require("../controllers/autoOrderController");

router.get("/me", protect, authorize("customer"), getMine);
router.post("/me", protect, authorize("customer"), createMine);
router.put("/me/day", protect, authorize("customer"), editDay);
router.delete("/me", protect, authorize("customer"), stopMine);

module.exports = router;
