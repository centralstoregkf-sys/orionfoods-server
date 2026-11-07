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

/* TEMPORARY DEBUG - delete this block once the server starts fine */
Object.entries({
  createOrder,
  getMyOrders,
  getAllOrders,
  updateMyOrder,
  updateOrder,
  deleteOrder,
  protect,
  authorize,
}).forEach(([name, fn]) => {
  if (typeof fn !== "function") console.error(`❌ orderRoutes: ${name} is ${typeof fn}`);
});
if (typeof authorize === "function" && typeof authorize("admin") !== "function") {
  console.error("❌ orderRoutes: authorize(...) did not return a function");
}
/* END DEBUG */

router.post("/", protect, authorize("customer", "admin", "staff"), createOrder);
router.get("/my", protect, authorize("customer"), getMyOrders);
router.get("/", protect, authorize("admin", "staff"), getAllOrders);
router.put("/:id/mine", protect, authorize("customer"), updateMyOrder);
router.put("/:id", protect, authorize("admin"), updateOrder);
router.delete("/:id", protect, authorize("admin"), deleteOrder);

module.exports = router;
