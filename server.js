require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const connectDB = require("./config/db");

const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const authRoutes = require("./routes/authRoutes");
const customerRoutes = require("./routes/customerRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const autoOrderRoutes = require("./routes/autoOrderRoutes");

// --- Safe loader for auto-order scheduler ---
let startAutoOrderScheduler = null;
try {
  const autoOrderRunner = require("./utils/autoOrderRunner");
  if (typeof autoOrderRunner === "function") {
    // module.exports = startAutoOrderScheduler (default export)
    startAutoOrderScheduler = autoOrderRunner;
  } else if (typeof autoOrderRunner.startAutoOrderScheduler === "function") {
    startAutoOrderScheduler = autoOrderRunner.startAutoOrderScheduler;
  } else if (typeof autoOrderRunner.startScheduler === "function") {
    startAutoOrderScheduler = autoOrderRunner.startScheduler;
  } else {
    console.warn(
      "autoOrderRunner exported keys:",
      Object.keys(autoOrderRunner || {})
    );
    console.warn(
      "autoOrderRunner has no startAutoOrderScheduler function — scheduler disabled."
    );
  }
} catch (err) {
  console.warn("Could not load ./utils/autoOrderRunner:", err.message);
}

// ensure uploads dir
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

connectDB();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/auto-orders", autoOrderRoutes);

app.get("/", (req, res) => res.json({ message: "Food ordering API running" }));

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  if (typeof startAutoOrderScheduler === "function") {
    try {
      startAutoOrderScheduler();
      console.log("Auto-order scheduler started.");
    } catch (err) {
      console.error("Failed to start auto-order scheduler:", err);
    }
  } else {
    console.warn("Auto-order scheduler is not available. Server will continue normally.");
  }
});

// Graceful shutdown (optional but recommended)
process.on("SIGINT", () => {
  console.log("Shutting down...");
  server.close(() => process.exit(0));
});
