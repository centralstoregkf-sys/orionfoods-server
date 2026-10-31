const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    pincode: { type: String, default: "" },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "staff", "customer"],
      default: "customer",
    },
  },
  { timestamps: true }
);

// Corrected pre-save hook for newer Mongoose versions
userSchema.pre("save", async function () {
  // If password is not modified, just return
  if (!this.isModified("password")) {
    return;
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    throw error;
  }
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
