const Payment = require("../models/Payment");
const Customer = require("../models/Customer");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");
const { notifyAfterPayment } = require("../utils/balanceNotifier");

const removeTempFile = (file) => {
  if (file?.path) fs.unlink(file.path, () => {});
};

// @desc Create a payment
//  - customer: screenshot required, saved as "processing"
//  - admin: any customer (via `customer` id), screenshot optional, saved as "confirmed"
exports.createPayment = async (req, res) => {
  try {
    const { amount, customer: customerRef } = req.body;
    const isAdmin = req.user.role === "admin";
    const amt = Number(amount);

    if (!(amt > 0)) {
      removeTempFile(req.file);
      return res.status(400).json({ message: "Enter a valid amount" });
    }

    if (!isAdmin && !req.file) {
      return res.status(400).json({ message: "Screenshot required" });
    }

    const customer =
      isAdmin && customerRef
        ? await Customer.findById(customerRef)
        : await Customer.findOne({ user: req.user._id });

    if (!customer) {
      removeTempFile(req.file);
      return res.status(404).json({ message: "Customer not found" });
    }

    // upload to cloudinary from disk (only if a file was sent)
    let screenshot = "";
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "food-ordering-payments",
      });
      fs.unlinkSync(req.file.path);
      screenshot = result.secure_url;
    }

    const payment = await Payment.create({
      customer: customer._id,
      customerId: customer.customerId,
      amount: amt,
      screenshot,
      status: isAdmin ? "confirmed" : "processing",
    });

    // Balances update immediately, as per requirement
    customer.openingBalance += amt;
    customer.currentBalance += amt;
    if (isAdmin) customer.totalPaymentsReceived += amt; // already confirmed
    await customer.save();

    // Email if balance is still below the minimum after this payment
    notifyAfterPayment(customer);

    res.status(201).json(payment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// @desc Get my payments (customer)
exports.getMyPayments = async (req, res) => {
  try {
    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer) return res.status(404).json({ message: "Not found" });
    const payments = await Payment.find({ customer: customer._id }).sort({
      createdAt: -1,
    });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc Get all payments (admin)
exports.getAllPayments = async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate("customer")
      .sort({ createdAt: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc Confirm / reject payment (admin)
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Not found" });

    if (status === "confirmed" && payment.status !== "confirmed") {
      const customer = await Customer.findById(payment.customer);
      if (customer) {
        customer.totalPaymentsReceived += payment.amount;
        await customer.save();
      }
    }

    payment.status = status;
    await payment.save();
    res.json(payment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};