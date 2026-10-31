const Customer = require("../models/Customer");
const User = require("../models/User");
const { fail, sendError } = require("../utils/httpError");
const { sanitizeLocation } = require("../utils/delivery");

exports.getMyProfile = async (req, res) => {
  try {
    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer) {
      return res.status(404).json({ message: "Customer profile not found" });
    }
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateMyProfile = async (req, res) => {
  try {
    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer) {
      return res.status(404).json({ message: "Customer profile not found" });
    }

    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "").trim();
    const email = String(req.body.email || "").trim();
    const address = String(req.body.address || "").trim();
    const pincode = String(req.body.pincode || "").trim();

    if (!name || !phone || !email || !address || !pincode) {
      return res
        .status(400)
        .json({ message: "Name, phone, email, address and pincode are required" });
    }
    if (!/^[0-9+\-\s]{7,15}$/.test(phone)) {
      return res.status(400).json({ message: "Enter a valid phone number" });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ message: "Enter a valid 6-digit pincode" });
    }

    if (email !== customer.email) {
      const taken = await User.findOne({ email, _id: { $ne: req.user._id } });
      if (taken) return res.status(400).json({ message: "This email is already in use" });
    }

    customer.name = name;
    customer.phone = phone;
    customer.email = email;
    customer.address = address;
    customer.pincode = pincode;
    await customer.save();

    await User.findByIdAndUpdate(req.user._id, { name, email, phone, address, pincode });

    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateMyLocation = async (req, res) => {
  try {
    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer) fail(404, "Customer profile not found");

    customer.location = sanitizeLocation(req.body);
    await customer.save();
    res.json(customer);
  } catch (error) {
    sendError(res, error);
  }
};

exports.updateCustomerLocation = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) fail(404, "Not found");

    customer.location = sanitizeLocation(req.body);
    await customer.save();
    res.json(customer);
  } catch (error) {
    sendError(res, error);
  }
};

exports.getAllCustomers = async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: "Not found" });
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: "Not found" });
    await User.findByIdAndDelete(customer.user);
    await Customer.findByIdAndDelete(req.params.id);
    res.json({ message: "Customer deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
