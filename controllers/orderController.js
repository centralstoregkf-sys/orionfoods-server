const Order = require("../models/Order");
const Customer = require("../models/Customer");
const AutoPlan = require("../models/AutoPlan");
const generateServiceId = require("../utils/serviceIdGenerator");
const { PRICE, normalCost } = require("../utils/pricing");
const { dateKey, assertOpen, todayIST } = require("../utils/cutoff");
const { assertDeliverable } = require("../utils/delivery");
const { fail, sendError } = require("../utils/httpError");
const { pushIfCrossedBelowMin } = require("../utils/pushNotifier");
const sendEmail = require("../utils/sendEmail"); // adjust the path if your email file is named differently

/* Email the customer when the balance reaches ₹500 or goes below it */
const LOW_BALANCE_EMAIL_AT = sendEmail.LOW_BALANCE_EMAIL_AT;

const toCount = (v) => Math.max(0, Math.min(99, Math.floor(Number(v)) || 0));

const ensureBalance = (customer, extra) => {
  if (extra > 0 && Number(customer.currentBalance) - extra <= 0) {
    fail(400, "Not enough balance. Your balance must stay above ₹0. Please add a payment first.");
  }
};

/* Sends one email when this change moved the balance from above ₹500 to ₹500 or below.
   Never blocks or breaks the order if the email fails.
   After it is sent, today is marked so the daily reminder doesn't repeat it the same day. */
const emailIfCrossedMinimum = (customer, balanceBefore) => {
  const after = Number(customer.currentBalance);
  const before = Number(balanceBefore);
  if (!customer.email) return;
  if (!(before > LOW_BALANCE_EMAIL_AT && after <= LOW_BALANCE_EMAIL_AT)) return;

  sendEmail
    .trySend(customer.email, sendEmail.lowBalanceEmail(customer, after))
    .then((sent) => {
      if (!sent) return;
      return Customer.collection.updateOne(
        { _id: customer._id },
        { $set: { lowBalanceEmailDate: todayIST() } }
      );
    })
    .catch((err) => console.error("Low balance email mark failed:", err.message));
};

/* One order per customer per date. Pass exceptId when moving an existing order. */
const assertNoOrderOnDate = async (customer, date, exceptId) => {
  const key = dateKey(date);
  const orders = await Order.find({ customer: customer._id }).select("date");
  const clash = orders.some(
    (o) => String(o._id) !== String(exceptId || "") && dateKey(o.date) === key
  );
  if (clash) {
    fail(
      400,
      `An order already exists on ${key}. Only one order per date is allowed, so please edit the existing order instead.`
    );
  }
};

/* notify: true -> also email the customer an order confirmation (used for normal orders only;
   auto-order days are covered by one single auto-order email). */
const placeOrder = async (customer, { date, bc, lc, dc, totalCost }, { notify = false } = {}) => {
  const cost = totalCost === undefined ? normalCost(bc, lc, dc) : totalCost;
  await assertNoOrderOnDate(customer, date);
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

  const balanceBefore = Number(customer.currentBalance);

  customer.totalMeals += bc + lc + dc;
  customer.currentBalance -= cost;
  await customer.save();

  // Order confirmation email (normal orders)
  if (notify && customer.email) {
    sendEmail.trySend(customer.email, sendEmail.orderEmail(customer, order, dateKey(order.date)));
  }

  // Phone push if this order pushed the balance below the minimum
  pushIfCrossedBelowMin(customer, balanceBefore);
  // Email if the balance reached ₹500 or below
  emailIfCrossedMinimum(customer, balanceBefore);

  return order;
};

const reviseOrder = async (customer, order, { date, bc, lc, dc, totalCost }) => {
  const cost = totalCost === undefined ? normalCost(bc, lc, dc) : totalCost;
  const oldMeals = order.breakfastCount + order.lunchCount + order.dinnerCount;
  const delta = cost - order.totalCost;

  if (date && dateKey(date) !== dateKey(order.date)) {
    await assertNoOrderOnDate(customer, date, order._id);
  }
  ensureBalance(customer, delta);

  if (date) order.date = date;
  order.breakfastCount = bc;
  order.lunchCount = lc;
  order.dinnerCount = dc;
  order.totalCost = cost;
  await order.save();

  const balanceBefore = Number(customer.currentBalance);

  customer.totalMeals += bc + lc + dc - oldMeals;
  customer.currentBalance -= delta;
  await customer.save();

  // Phone push if this change pushed the balance below the minimum
  pushIfCrossedBelowMin(customer, balanceBefore);
  // Email if the balance reached ₹500 or below
  emailIfCrossedMinimum(customer, balanceBefore);

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

    const order = await placeOrder(customer, { date, bc, lc, dc }, { notify: true });
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
