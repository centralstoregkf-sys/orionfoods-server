const Order = require("../models/Order");
const Customer = require("../models/Customer");
const AutoPlan = require("../models/AutoPlan");
const generateServiceId = require("../utils/serviceIdGenerator");
const { PRICE, normalCost } = require("../utils/pricing");
const { dateKey, assertOpen } = require("../utils/cutoff");
const { assertDeliverable } = require("../utils/delivery");
const { fail, sendError } = require("../utils/httpError");

const toCount = (v) => Math.max(0, Math.min(99, Math.floor(Number(v)) || 0));

const ensureBalance = (customer, extra) => {
  if (extra > 0 && Number(customer.currentBalance) - extra <= 0) {
    fail(400, "Not enough balance. Your balance must stay above ₹0. Please add a payment first.");
  }
};

const placeOrder = async (customer, { date, bc, lc, dc, totalCost }) => {
  const cost = totalCost === undefined ? normalCost(bc, lc, dc) : totalCost;
  ensureBalance(customer, cost);
  const serviceId = await generateServiceId();

  const order = await Order.create({
    serviceId,
    customer: customer._id,
    customerId: customer.customerId,
    email: customer.email,
    date,
    breakfastCount: bc,
    lunchCount: lc,
    dinnerCount: dc,
    totalCost: cost,
  });

  customer.totalMeals += bc + lc + dc;
  customer.currentBalance -= cost;
  await customer.save();

  return order;
};

const reviseOrder = async (customer, order, { date, bc, lc, dc, totalCost }) => {
  const cost = totalCost === undefined ? normalCost(bc, lc, dc) : totalCost;
  const oldMeals = order.breakfastCount + order.lunchCount + order.dinnerCount;
  const delta = cost - order.totalCost;
  ensureBalance(customer, delta);

  if (date) order.date = date;
  order.breakfastCount = bc;
  order.lunchCount = lc;
  order.dinnerCount = dc;
  order.totalCost = cost;
  await order.save();

  customer.totalMeals += bc + lc + dc - oldMeals;
  customer.currentBalance -= delta;
  await customer.save();

  return order;
};

const removeOrder = async (customer, order) => {
  customer.totalMeals -= order.breakfastCount + order.lunchCount + order.dinnerCount;
  customer.currentBalance += order.totalCost;
  await customer.save();
  await Order.findByIdAndDelete(order._id);
};

exports.PRICE = PRICE;
exports.placeOrder = placeOrder;
exports.reviseOrder = reviseOrder;
exports.removeOrder = removeOrder;

exports.createOrder = async (req, res) => {
  try {
    const { date, breakfastCount, lunchCount, dinnerCount, customer: customerRef } = req.body;

    const isPrivileged = ["admin", "staff"].includes(req.user.role);
    const customer =
      isPrivileged && customerRef
        ? await Customer.findById(customerRef)
        : await Customer.findOne({ user: req.user._id });

    if (!customer) fail(404, "Customer profile not found");
    if (!isPrivileged) assertDeliverable(customer);
    if (!date) fail(400, "Please select a date");

    const bc = toCount(breakfastCount);
    const lc = toCount(lunchCount);
    const dc = toCount(dinnerCount);
    if (bc + lc + dc === 0) fail(400, "Add at least one meal");

    if (!isPrivileged) {
      assertOpen(dateKey(date), { breakfast: bc > 0, lunch: lc > 0, dinner: dc > 0 });
    }

    const order = await placeOrder(customer, { date, bc, lc, dc });
    res.status(201).json(order);
  } catch (error) {
    sendError(res, error);
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer) return res.status(404).json({ message: "Not found" });

    const orders = await Order.find({ customer: customer._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("customer", "name customerId phone email address pincode location")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateMyOrder = async (req, res) => {
  try {
    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer) fail(404, "Customer profile not found");

    const order = await Order.findOne({ _id: req.params.id, customer: customer._id });
    if (!order) fail(404, "Order not found");

    const inPlan = await AutoPlan.exists({ customer: customer._id, "days.order": order._id });
    if (inPlan) fail(400, "This order is part of your auto order. Edit it from Set auto order.");

    const date = dateKey(order.date);
    const next = {
      breakfast: toCount(req.body.breakfastCount),
      lunch: toCount(req.body.lunchCount),
      dinner: toCount(req.body.dinnerCount),
    };

    assertOpen(date, {
      breakfast: next.breakfast !== order.breakfastCount,
      lunch: next.lunch !== order.lunchCount,
      dinner: next.dinner !== order.dinnerCount,
    });

    if (next.breakfast + next.lunch + next.dinner === 0) {
      await removeOrder(customer, order);
      return res.json({ deleted: true });
    }

    await reviseOrder(customer, order, { bc: next.breakfast, lc: next.lunch, dc: next.dinner });
    res.json(order);
  } catch (error) {
    sendError(res, error);
  }
};

exports.updateOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) fail(404, "Not found");

    const customer = await Customer.findById(order.customer);
    if (!customer) fail(404, "Customer missing");

    const { date, breakfastCount, lunchCount, dinnerCount } = req.body;
    await reviseOrder(customer, order, {
      date: date || undefined,
      bc: toCount(breakfastCount),
      lc: toCount(lunchCount),
      dc: toCount(dinnerCount),
    });

    res.json(order);
  } catch (error) {
    sendError(res, error);
  }
};

exports.deleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Not found" });

    const customer = await Customer.findById(order.customer);
    if (customer) {
      await removeOrder(customer, order);
    } else {
      await Order.findByIdAndDelete(req.params.id);
    }

    res.json({ message: "Order deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
