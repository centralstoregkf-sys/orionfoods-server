const Customer = require("../models/Customer");
const PushLog = require("../models/PushLog");

const ONESIGNAL_URL = "https://api.onesignal.com/notifications?c=push";

const minBalance = () => Number(process.env.MIN_BALANCE) || 500;

// New keys start with "os_" and use "Key"; old style keys use "Basic"
const authHeader = (key) => (key.startsWith("os_") ? `Key ${key}` : `Basic ${key}`);

// Today's date in India, so "once a day" follows IST
const istDate = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

/* Marks "this customer got a low-balance push today".
   Returns true only for the first call of the day. Never throws. */
const claimToday = async (customerId) => {
  try {
    await PushLog.create({ key: `low-${customerId}-${istDate()}` });
    return true;
  } catch (err) {
    if (err.code !== 11000) console.error("[push] log error:", err.message);
    return false;
  }
};

/* Never throws: a push problem must never break an order or payment. */
const sendPush = async (externalIds, { title, message, url } = {}) => {
  try {
    const appId = process.env.ONESIGNAL_APP_ID;
    const apiKey = process.env.ONESIGNAL_REST_API_KEY;
    if (!appId || !apiKey) {
      console.warn(
        `[push] OneSignal env missing (ONESIGNAL_APP_ID: ${appId ? "set" : "MISSING"}, ONESIGNAL_REST_API_KEY: ${
          apiKey ? "set" : "MISSING"
        }). Push skipped.`
      );
      return;
    }

    const ids = [...new Set([].concat(externalIds || []).filter(Boolean).map(String))];
    if (ids.length === 0) {
      console.warn("[push] no external ids to send to, skipped");
      return;
    }

    console.log(`[push] sending to ${ids.length} user(s), app ${appId.slice(0, 8)}..., key ${apiKey.slice(0, 4)}...`);

    for (let i = 0; i < ids.length; i += 1000) {
      const body = {
        app_id: appId,
        target_channel: "push",
        include_aliases: { external_id: ids.slice(i, i + 1000) },
        headings: { en: title },
        contents: { en: message },
      };
      if (url) body.url = url;

      const res = await fetch(ONESIGNAL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader(apiKey),
        },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      if (!res.ok) {
        console.error("[push] OneSignal error", res.status, text);
      } else {
        console.log("[push] OneSignal accepted:", text);
      }
    }
  } catch (err) {
    console.error("[push] failed:", err.message);
  }
};

const lowBalanceMessage = () => ({
  title: "Low balance",
  message: `Your balance is below ₹${minBalance()}. Please add a payment to keep your orders running.`,
  url: process.env.FRONTEND_URL || undefined,
});

/* After an order: push right away when the balance has just crossed below the minimum. */
const pushIfCrossedBelowMin = (customer, balanceBefore) => {
  const min = minBalance();
  const before = Number(balanceBefore);
  const after = Number(customer?.currentBalance);
  console.log(`[push] order check: before=${before}, after=${after}, min=${min}, user=${customer?.user || "MISSING"}`);

  if (!customer?.user) {
    console.warn("[push] customer has no `user` field, push skipped");
    return;
  }
  if (!(before >= min && after < min)) {
    console.log("[push] balance did not cross below the minimum, no push");
    return;
  }

  (async () => {
    // mark today as done so the daily reminder does not repeat this push
    await claimToday(customer._id);
    await sendPush(customer.user, lowBalanceMessage());
  })().catch((err) => console.error("[push] failed:", err.message));
};

/* After a payment: if the balance is still below the minimum and no push went out today, push now. */
const pushIfBelowMin = (customer) => {
  const min = minBalance();
  const after = Number(customer?.currentBalance);
  console.log(`[push] payment check: balance=${after}, min=${min}, user=${customer?.user || "MISSING"}`);

  if (!customer?.user) {
    console.warn("[push] customer has no `user` field, push skipped");
    return;
  }
  if (!(after < min)) {
    console.log("[push] balance is at or above the minimum, no push");
    return;
  }

  (async () => {
    if (await claimToday(customer._id)) {
      await sendPush(customer.user, lowBalanceMessage());
    } else {
      console.log("[push] already notified today, no push");
    }
  })().catch((err) => console.error("[push] failed:", err.message));
};

/* Daily job: every customer still below the minimum gets ONE push per day.
   Customers whose balance is back at the minimum or above are not included, so it stops by itself. */
const sendDailyLowBalanceReminders = async () => {
  const customers = await Customer.find({
    currentBalance: { $lt: minBalance() },
    user: { $ne: null },
  }).select("user");

  const recipients = [];
  for (const c of customers) {
    if (await claimToday(c._id)) recipients.push(c.user);
  }

  if (recipients.length === 0) return 0;

  await sendPush(recipients, lowBalanceMessage());
  return recipients.length;
};

module.exports = {
  sendPush,
  pushIfCrossedBelowMin,
  pushIfBelowMin,
  sendDailyLowBalanceReminders,
};
