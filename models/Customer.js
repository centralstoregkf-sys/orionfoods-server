const mongoose = require("mongoose");

/* Saved delivery pin of the customer */
const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    accuracy: { type: Number },
    note: { type: String, default: "" },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const customerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    customerId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    // default "" so older customers without a pincode can still be saved
    pincode: { type: String, default: "" },
    email: { type: String, required: true },
    openingBalance: { type: Number, default: 0 },
    totalMeals: { type: Number, default: 0 },
    totalPaymentsReceived: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    location: { type: locationSchema, default: undefined },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Customer", customerSchema);
