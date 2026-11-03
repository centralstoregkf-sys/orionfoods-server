const { sendDailyLowBalanceReminders } = require("./pushNotifier");

const CHECK_EVERY_MS = 30 * 60 * 1000; // every 30 minutes

// First hour (IST, 0-23) from which the daily reminder may go out
const startHour = () => {
  const h = Number(process.env.DAILY_REMINDER_HOUR);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 9;
};

const istHour = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCHours();

const tick = async () => {
  try {
    if (istHour() < startHour()) return;
    const count = await sendDailyLowBalanceReminders();
    if (count > 0) console.log(`[push] daily reminder sent to ${count} customer(s)`);
  } catch (err) {
    console.error("[push] daily scheduler error:", err.message);
  }
};

module.exports = function startDailyReminderScheduler() {
  setTimeout(tick, 15 * 1000); // small delay so the database is connected first
  setInterval(tick, CHECK_EVERY_MS);
  console.log(`[push] daily reminder scheduler started (from ${startHour()}:00 IST)`);
};
