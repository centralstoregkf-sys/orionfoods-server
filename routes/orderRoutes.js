const express = require("express");
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getAllOrders,
  updateMyOrder,
  updateOrder,
  deleteOrder,
} = require("../controllers/orderController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");

router.post("/", protect, authorize("customer", "admin", "staff"), createOrder);
router.get("/my", protect, authorize("customer"), getMyOrders);
router.get("/", protect, authorize("admin", "staff"), getAllOrders);
router.put("/:id/mine", protect, authorize("customer"), updateMyOrder);
router.put("/:id", protect, authorize("admin"), updateOrder);
router.delete("/:id", protect, authorize("admin"), deleteOrder);

module.exports = router;
