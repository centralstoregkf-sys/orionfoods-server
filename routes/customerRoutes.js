const express = require("express");
const router = express.Router();
const {
  getMyProfile,
  updateMyProfile,
  updateMyLocation,
  updateCustomerLocation,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
} = require("../controllers/customerController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");

router.get("/me", protect, authorize("customer"), getMyProfile);
router.put("/me", protect, authorize("customer"), updateMyProfile);
router.put("/me/location", protect, authorize("customer"), updateMyLocation);
router.get("/", protect, authorize("admin", "staff"), getAllCustomers);
router.get("/:id", protect, authorize("admin", "staff"), getCustomerById);
router.put("/:id/location", protect, authorize("admin"), updateCustomerLocation);
router.put("/:id", protect, authorize("admin"), updateCustomer);
router.delete("/:id", protect, authorize("admin"), deleteCustomer);

module.exports = router;
