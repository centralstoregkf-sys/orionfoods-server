const Order = require("../models/Order");
const AutoPlan = require("../models/AutoPlan");
const Customer = require("../models/Customer");
const { placeOrder, reviseOrder, removeOrder } = require("./orderController");
const { AUTO_DAYS, autoDayCost } = require("../utils/pricing");
const { todayIST, addDays, isOpen, assertOpen } = require("../utils/cutoff");
const { assertDeliverable } = require("../utils/delivery");
const { fail, sendError } = require("../utils/httpError");

const one = (v) => (Number(v) > 0 ? 1 : 0);
const readCounts = (src) => ({
  b: one(src && src.breakfastCount),
  l: one(src && src.lunchCount),
  d: one(src && src.dinnerCount),
});
const sum = (c) => c.b + c.l + c.d;
const costOf = (c) => autoDayCost(c.b, c.l, c.d);
const writeCounts = (day, c) => {
  day.breakfastCount = c.b;
  day.lunchCount = c.l;
  day.dinnerCount = c.d;
};
const changedFlags = (prev, next) => ({
  breakfast: prev.b !== next.b,
  lunch: prev.l !== next.l,
  dinner: prev.d !== next.d,
});
const usedFlags = (c) => ({ breakfast: c.b > 0, lunch: c.l > 0, dinner: c.d > 0 });

const customerOf = async (req) => {
  const customer = await Customer.findOne({ user: req.user._id });
  if (!customer) fail(404, "Customer profile not found");
  return customer;
};

const isFinished = (plan) =>
  !plan.active || plan.days.every((d) => d.cancelled || d.date < todayIST());

const lastDate = (plan) => plan.days.reduce((max, d) => (d.date > max ? d.date : max), "");

const dropOrder = async (customer, day) => {
  if (!day.order) return;
  const order = await Order.findById(day.order);
  if (order) await removeOrder(customer, order);
  day.order = null;
};

const saveDayOrder = async (customer, day, c) => {
  const existing = day.order ? await Order.findById(day.order) : null;
  const payload = { bc: c.b, lc: c.l, dc: c.d, totalCost: costOf(c) };
  const order = existing
    ? await reviseOrder(customer, existing, payload)
    : await placeOrder(customer, { date: day.date, ...payload });
  day.order = order._id;
};

const appendExtension = async (customer, plan, c) => {
  const day = {
    date: addDays(lastDate(plan), 1),
    breakfastCount: c.b,
    lunchCount: c.l,
    dinnerCount: c.d,
    order: null,
    cancelled: false,
    extended: true,
  };
  await saveDayOrder(customer, day, c);
  plan.days.push(day);
};

const releaseExtension = async (customer, plan) => {
  let index = -1;
  plan.days.forEach((d, i) => {
    if (d.extended && !d.cancelled) index = i;
  });
  if (index < 0) fail(400, "This leave day can't be restored.");
  const ext = plan.days[index];
  assertOpen(ext.date, usedFlags(readCounts(ext)));
  await dropOrder(customer, ext);
  plan.days.splice(index, 1);
};

const applyDay = async (customer, plan, day, next, extend) => {
  const prev = readCounts(day);
  const flags = changedFlags(prev, next);
  if (!flags.breakfast && !flags.lunch && !flags.dinner) return;

  if (sum(next) === 0) {
    await dropOrder(customer, day);
    day.was = { breakfastCount: prev.b, lunchCount: prev.l, dinnerCount: prev.d };
    writeCounts(day, next);
    day.cancelled = true;
    if (extend && sum(prev) > 0) await appendExtension(customer, plan, prev);
    return;
  }

  if (day.cancelled) await releaseExtension(customer, plan);
  await saveDayOrder(customer, day, next);
  writeCounts(day, next);
  day.cancelled = false;
};

const view = (plan) => {
  if (!plan) return { plan: null };
  const days = plan.days
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const c = readCounts(d);
      return {
        date: d.date,
        breakfastCount: c.b,
        lunchCount: c.l,
        dinnerCount: c.d,
        cancelled: Boolean(d.cancelled),
        extended: Boolean(d.extended),
        cost: d.cancelled ? 0 : costOf(c),
      };
    });
  return {
    plan: {
      active: plan.active && !isFinished(plan),
      startDate: plan.startDate,
      days,
      mealDays: days.filter((d) => !d.cancelled).length,
      totalCost: days.reduce((t, d) => t + d.cost, 0),
    },
  };
};

exports.getMine = async (req, res) => {
  try {
    const customer = await customerOf(req);
    const plan = await AutoPlan.findOne({ customer: customer._id });
    res.json(view(plan));
  } catch (error) {
    sendError(res, error);
  }
};

exports.createMine = async (req, res) => {
  try {
    const customer = await customerOf(req);
    assertDeliverable(customer);

    const current = await AutoPlan.findOne({ customer: customer._id });
    if (current && !isFinished(current)) {
      fail(400, "You already have an auto order running. Edit its dates or stop it first.");
    }

    const startDate = String(req.body.startDate || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate <= todayIST()) {
      fail(400, "Start date must be tomorrow or later");
    }

    const template = readCounts(req.body.template);
    if (sum(template) === 0) fail(400, "Choose the meals for your auto order");

    const entries = Array.from({ length: AUTO_DAYS }, (_, i) =>
      readCounts(req.body.days && req.body.days[i])
    );
    const leaves = entries.filter((e) => sum(e) === 0).length;
    if (leaves === AUTO_DAYS) fail(400, "Set meals for at least one day");

    entries.forEach((c, i) => assertOpen(addDays(startDate, i), usedFlags(c)));

    const total =
      entries.reduce((t, c) => t + (sum(c) > 0 ? costOf(c) : 0), 0) + leaves * costOf(template);
    if (Number(customer.currentBalance) - total <= 0) {
      fail(
        400,
        `Your auto order needs ₹${total}. Your balance must stay above ₹0 after this, so please add a payment first.`
      );
    }

    if (current) await AutoPlan.deleteOne({ _id: current._id });

    const plan = new AutoPlan({
      customer: customer._id,
      active: true,
      startDate,
      template: { breakfastCount: template.b, lunchCount: template.l, dinnerCount: template.d },
      days: [],
    });

    try {
      for (let i = 0; i < AUTO_DAYS; i += 1) {
        const c = entries[i];
        const day = {
          date: addDays(startDate, i),
          breakfastCount: c.b,
          lunchCount: c.l,
          dinnerCount: c.d,
          order: null,
          cancelled: sum(c) === 0,
          extended: false,
        };
        if (sum(c) === 0) {
          day.was = { breakfastCount: template.b, lunchCount: template.l, dinnerCount: template.d };
        } else {
          await saveDayOrder(customer, day, c);
        }
        plan.days.push(day);
      }
      for (let i = 0; i < leaves; i += 1) {
        await appendExtension(customer, plan, template);
      }
    } catch (error) {
      for (const d of plan.days) {
        try {
          await dropOrder(customer, d);
        } catch (rollbackError) {
          console.error(rollbackError.message);
        }
      }
      throw error;
    }

    await plan.save();
    res.status(201).json(view(plan));
  } catch (error) {
    sendError(res, error);
  }
};

exports.editDay = async (req, res) => {
  try {
    const customer = await customerOf(req);
    const plan = await AutoPlan.findOne({ customer: customer._id, active: true });
    if (!plan || isFinished(plan)) fail(404, "You have no running auto order");

    const date = String(req.body.date || "");
    const day = plan.days.find((d) => d.date === date);
    if (!day) fail(404, "That date is not part of your auto order");

    const next = readCounts(req.body);
    assertOpen(date, changedFlags(readCounts(day), next));

    await applyDay(customer, plan, day, next, true);
    plan.markModified("days");
    await plan.save();
    res.json(view(plan));
  } catch (error) {
    sendError(res, error);
  }
};

exports.stopMine = async (req, res) => {
  try {
    const customer = await customerOf(req);
    const plan = await AutoPlan.findOne({ customer: customer._id, active: true });
    if (!plan || isFinished(plan)) fail(404, "You have no running auto order");

    for (const day of plan.days) {
      if (day.cancelled) continue;
      const prev = readCounts(day);
      const keep = {
        b: isOpen(day.date, "breakfast") ? 0 : prev.b,
        l: isOpen(day.date, "lunch") ? 0 : prev.l,
        d: isOpen(day.date, "dinner") ? 0 : prev.d,
      };
      await applyDay(customer, plan, day, keep, false);
    }

    plan.active = false;
    plan.markModified("days");
    await plan.save();
    res.json(view(plan));
  } catch (error) {
    sendError(res, error);
  }
};
