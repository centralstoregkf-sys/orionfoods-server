const mongoose = require("mongoose");

const daySchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    breakfastCount: { type: Number, default: 0 },
    lunchCount: { type: Number, default: 0 },
    dinnerCount: { type: Number, default: 0 },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    cancelled: { type: Boolean, default: false },
    extended: { type: Boolean, default: false },
    was: {
      breakfastCount: { type: Number, default: 0 },
      lunchCount: { type: Number, default: 0 },
      dinnerCount: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const autoPlanSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    active: { type: Boolean, default: true },
    startDate: { type: String, required: true },
    template: {
      breakfastCount: { type: Number, default: 0 },
      lunchCount: { type: Number, default: 0 },
      dinnerCount: { type: Number, default: 0 },
    },
    days: [daySchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("AutoPlan", autoPlanSchema);
