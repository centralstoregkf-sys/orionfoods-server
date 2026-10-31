const AutoPlan = require("../models/AutoPlan");
const { todayIST } = require("./cutoff");

const runAutoOrders = async () => {
  try {
    await AutoPlan.updateMany(
      { active: true, days: { $not: { $elemMatch: { date: { $gte: todayIST() } } } } },
      { $set: { active: false } }
    );
  } catch (error) {
    console.error("Auto order cleanup failed:", error.message);
  }
};

const startAutoOrderRunner = () => {
  runAutoOrders();
  return setInterval(runAutoOrders, 60 * 60 * 1000);
};

module.exports = { todayIST, runAutoOrders, startAutoOrderRunner };
