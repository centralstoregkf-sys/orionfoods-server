const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { sendDailyLowBalanceReminders } = require("../utils/pushNotifier");

const router = express.Router();

// Frontend uses this id to link the logged-in user with OneSignal
router.get("/me", protect, (req, res) => {
  res.json({ externalId: String(req.user._id) });
});

// Optional: cron-job.org can call this (it also wakes a sleeping Render server).
// Each customer still gets at most one low-balance push per day.
router.post("/daily-reminder", async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.get("x-cron-secret") !== secret) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const count = await sendDailyLowBalanceReminders();
    res.json({ sent: count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
