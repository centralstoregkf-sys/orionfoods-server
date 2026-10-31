const { fail } = require("./httpError");

const CUT_HOUR = { breakfast: 19, lunch: 19, dinner: 21 };
const LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
const DAY_MS = 86400000;
const HOUR_MS = 3600000;

const todayIST = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);

const addDays = (date, n) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

const dateKey = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const cutoffMs = (date, meal) =>
  Date.parse(`${date}T00:00:00+05:30`) - (24 - CUT_HOUR[meal]) * HOUR_MS;

const isOpen = (date, meal, now = Date.now()) => Boolean(date) && now < cutoffMs(date, meal);

const stamp = (ms) =>
  new Date(ms).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const shortDate = (date) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

const assertOpen = (date, flags) => {
  Object.keys(flags).forEach((meal) => {
    if (flags[meal] && !isOpen(date, meal)) {
      fail(
        400,
        `${LABEL[meal]} for ${shortDate(date)} can't be added or changed any more. It closed on ${stamp(cutoffMs(date, meal))}.`
      );
    }
  });
};

module.exports = { todayIST, addDays, dateKey, cutoffMs, isOpen, assertOpen };
