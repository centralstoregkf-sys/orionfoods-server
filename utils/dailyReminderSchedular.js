const { sendDailyLowBalanceReminders } = require("./pushNotifier");
const Customer = require("../models/Customer");
const { todayIST } = require("./cutoff");
const sendEmail = require("./sendEmail");

const CHECK_EVERY_MS = 30 * 60 * 1000; // every 30 minutes
const LOW_BALANCE_EMAIL_AT = sendEmail.LOW_BALANCE_EMAIL_AT;

let running = false;

// First hour (IST, 0-23) from which the daily reminder may go out
const startHour = () => {
  const h = Number(process.env.DAILY_REMINDER_HOUR);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 9;
};

const istHour = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCHours();

/* Emails every customer whose balance is ₹500 or below, once per IST day.
   "lowBalanceEmailDate" is stored straight on the customer document (native driver),
   so no schema change is needed and it survives server restarts. */
const sendDailyLowBalanceEmails = async () => {
  const today = todayIST();

  const due = await Customer.collection
    .find({
      currentBalance: { $lte: LOW_BALANCE_EMAIL_AT },
      email: { $exists: true, $ne: "" },
      lowBalanceEmailDate: { $ne: today },
    })
    .toArray();

  let sent = 0;
  for (const customer of due) {
    const ok = await sendEmail.trySend(
      customer.email,
      sendEmail.lowBalanceEmail(customer, customer.currentBalance, { daily: true })
    );
    if (!ok) continue;

    await Customer.collection.updateOne(
      { _id: customer._id },
      { $set: { lowBalanceEmailDate: today } }
    );
    sent += 1;
  }
  return sent;
};

const tick = async () => {
  if (running) return;
  running = true;
  try {
    if (istHour() < startHour()) return;

    // Phone push reminder
    try {
      const count = await sendDailyLowBalanceReminders();
      if (count > 0) console.log(`[push] daily reminder sent to ${count} customer(s)`);
    } catch (err) {
      console.error("[push] daily scheduler error:", err.message);
    }

    // Email reminder
    try {
      const emails = await sendDailyLowBalanceEmails();
      if (emails > 0) console.log(`[email] daily reminder sent to ${emails} customer(s)`);
    } catch (err) {
      console.error("[email] daily scheduler error:", err.message);
    }
  } finally {
    running = false;
  }
};

module.exports = function startDailyReminderScheduler() {
  setTimeout(tick, 15 * 1000); // small delay so the database is connected first
  setInterval(tick, CHECK_EVERY_MS);
  console.log(`[push] daily reminder scheduler started (from ${startHour()}:00 IST)`);
};
