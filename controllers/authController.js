const User = require("../models/User");
const Customer = require("../models/Customer");
const generateToken = require("../utils/generateToken");

// @desc Register a user (customer signup / all roles create)
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, address, pincode, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Please add all required fields" });
    }

    const cleanPincode = String(pincode || "").trim();
    const finalRole = role || "customer";

    // Pincode is required for customer sign-up
    if (finalRole === "customer") {
      if (!cleanPincode) {
        return res.status(400).json({ message: "Pincode is required" });
      }
      if (!/^\d{6}$/.test(cleanPincode)) {
        return res.status(400).json({ message: "Enter a valid 6-digit pincode" });
      }
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = await User.create({
      name,
      email,
      phone: phone || "",
      address: address || "",
      pincode: cleanPincode,
      password,
      role: finalRole,
    });

    // If customer, create a Customer profile doc
    if (user.role === "customer") {
      const count = await Customer.countDocuments();
      const customerId = `CUST-${10001 + count}`;
      await Customer.create({
        user: user._id,
        customerId,
        name,
        phone: phone || "",
        address: address || "",
        pincode: cleanPincode,
        email,
        openingBalance: 0,
        totalMeals: 0,
        totalPaymentsReceived: 0,
        currentBalance: 0,
      });
    }

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// @desc Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// @desc Get current user
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
