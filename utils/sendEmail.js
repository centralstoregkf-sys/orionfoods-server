const nodemailer = require("nodemailer");

let transporter;

const LOW_BALANCE_EMAIL_AT = 500;

const getTransporter = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      // Gmail shows app passwords with spaces; they work without them
      pass: String(process.env.EMAIL_PASS || "").replace(/\s+/g, ""),
    },
  });

  return transporter;
};

const sendEmail = async ({ to, subject, html, text }) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("EMAIL_USER / EMAIL_PASS are not set in .env");
  }

  return getTransporter().sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || "ORION Foods"}" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
    text,
  });
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const BRAND = () => process.env.EMAIL_FROM_NAME || "ORION Foods";

const esc = (v) =>
  String(v === undefined || v === null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const formatDate = (key) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key || ""));
  if (!m) return String(key || "");
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

const nowIST = () =>
  new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

/* Shared card layout. heading/intro/outro/extraHtml are trusted HTML (callers escape).
   rows = [[label, value]] — values are escaped here. */
const layout = ({
  accent = "#f59e0b",
  heading,
  intro = "",
  boxTitle = "",
  rows = [],
  highlight = null, // { label, value } big highlighted line inside the box
  extraHtml = "",
  outro = "",
}) => {
  const rowsHtml = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">${esc(label)}</td>
          <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:bold;text-align:right;border-bottom:1px solid #f3f4f6;">${esc(value)}</td>
        </tr>`
    )
    .join("");

  const highlightHtml = highlight
    ? `<div style="background:#fffbeb;border:1px dashed ${accent};border-radius:10px;padding:12px 14px;margin:0 0 14px;text-align:center;">
        <div style="font-size:12px;color:#92400e;text-transform:uppercase;letter-spacing:0.6px;">${esc(highlight.label)}</div>
        <div style="font-size:20px;color:#111827;font-weight:bold;margin-top:4px;">${esc(highlight.value)}</div>
      </div>`
    : "";

  return `
<div style="background:#f4f4f5;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;">
    <tr>
      <td style="background:${accent};padding:20px 24px;color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:0.5px;">
        ${esc(BRAND())}
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <h2 style="margin:0 0 10px;font-size:20px;color:#111827;">${heading}</h2>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#374151;">${intro}</p>
        ${
          boxTitle || rows.length || highlight
            ? `<div style="border:1px solid #e5e7eb;border-left:5px solid ${accent};border-radius:10px;padding:16px;margin:0 0 18px;background:#ffffff;">
          ${boxTitle ? `<div style="font-size:15px;font-weight:bold;color:#111827;margin:0 0 10px;">${esc(boxTitle)}</div>` : ""}
          ${highlightHtml}
          ${rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>` : ""}
        </div>`
            : ""
        }
        ${extraHtml}
        <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">${outro}</p>
      </td>
    </tr>
    <tr>
      <td style="background:#f9fafb;padding:14px 24px;text-align:center;font-size:12px;color:#9ca3af;">
        This is an automated message from ${esc(BRAND())}. Please do not reply.
      </td>
    </tr>
  </table>
</div>`;
};

const mealLabel = (c) => {
  const parts = [];
  if (Number(c.breakfastCount) > 0) parts.push(`B×${c.breakfastCount}`);
  if (Number(c.lunchCount) > 0) parts.push(`L×${c.lunchCount}`);
  if (Number(c.dinnerCount) > 0) parts.push(`D×${c.dinnerCount}`);
  return parts.join(" + ");
};

/* ------------------------------------------------------------------ */
/* Templates — each returns { subject, html, text }                    */
/* ------------------------------------------------------------------ */

const welcomeEmail = (user) => {
  const name = user.name || "there";
  const isCustomer = (user.role || "customer") === "customer";
  const outro = isCustomer
    ? `Please add a payment of at least ₹${LOW_BALANCE_EMAIL_AT} to your account to start ordering your meals.<br/><br/>Thank you,<br/>${esc(BRAND())}`
    : `Thank you,<br/>${esc(BRAND())}`;

  return {
    subject: `Welcome to ${BRAND()}`,
    text: `Hi ${name}, your ${BRAND()} account has been created successfully (${user.email}).${
      isCustomer ? ` Please add a payment of at least ₹${LOW_BALANCE_EMAIL_AT} to start ordering.` : ""
    }`,
    html: layout({
      heading: `Welcome, ${esc(name)}! 🎉`,
      intro: "Your account has been created successfully.",
      boxTitle: "Account details",
      rows: [
        ["Name", name],
        ["Email", user.email],
        ["Registered on", nowIST()],
      ],
      outro,
    }),
  };
};

const loginEmail = (user) => {
  const name = user.name || "there";
  return {
    subject: `New sign-in to your ${BRAND()} account`,
    text: `Hi ${name}, you signed in to your ${BRAND()} account on ${nowIST()} (IST). If this wasn't you, please change your password.`,
    html: layout({
      heading: "You just signed in",
      intro: `Hi ${esc(name)}, we noticed a sign-in to your account.`,
      boxTitle: "Sign-in details",
      rows: [
        ["Account", user.email],
        ["Time (IST)", nowIST()],
      ],
      outro: `If this wasn't you, please change your password right away.<br/><br/>Thank you,<br/>${esc(BRAND())}`,
    }),
  };
};

const orderEmail = (customer, order, dateKeyText) => {
  const name = customer.name || "Customer";
  const dateText = dateKeyText || "";
  const rows = [
    ["Service ID", order.serviceId],
    ["Date", formatDate(dateText)],
  ];
  if (Number(order.breakfastCount) > 0) rows.push(["Breakfast", `× ${order.breakfastCount}`]);
  if (Number(order.lunchCount) > 0) rows.push(["Lunch", `× ${order.lunchCount}`]);
  if (Number(order.dinnerCount) > 0) rows.push(["Dinner", `× ${order.dinnerCount}`]);
  rows.push(["Order total", money(order.totalCost)]);
  rows.push(["Balance left", money(customer.currentBalance)]);

  return {
    subject: `Order confirmed - ${order.serviceId}`,
    text: `Hi ${name}, your order ${order.serviceId} for ${formatDate(dateText)} is confirmed (${mealLabel(
      order
    )}). Total ${money(order.totalCost)}. Balance left ${money(customer.currentBalance)}.`,
    html: layout({
      heading: "Order confirmed ✅",
      intro: `Hi ${esc(name)}, your order has been placed successfully.`,
      boxTitle: "Order details",
      rows,
      outro: `Thank you for ordering with us,<br/>${esc(BRAND())}`,
    }),
  };
};

const autoOrderEmail = (customer, plan) => {
  const name = customer.name || "Customer";
  const days = (plan && plan.days) || [];
  const mealDays = days.filter((d) => !d.cancelled);
  const leaveDays = days.filter((d) => d.cancelled);
  const first = days.length ? days[0].date : plan.startDate;
  const lastMeal = mealDays.length ? mealDays[mealDays.length - 1].date : first;

  const tableRows = days
    .map((d) => {
      const bg = d.cancelled ? "#fef2f2" : "#ffffff";
      const meals = d.cancelled
        ? `<span style="color:#dc2626;">Leave</span>`
        : esc(mealLabel(d));
      const cost = d.cancelled ? "—" : esc(money(d.cost));
      const tag = d.extended
        ? ` <span style="font-size:11px;color:#b45309;">(extended)</span>`
        : "";
      return `<tr style="background:${bg};">
        <td style="padding:8px 10px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${esc(
          formatDate(d.date)
        )}${tag}</td>
        <td style="padding:8px 10px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${meals}</td>
        <td style="padding:8px 10px;font-size:13px;color:#111827;text-align:right;border-bottom:1px solid #f3f4f6;">${cost}</td>
      </tr>`;
    })
    .join("");

  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin:0 0 18px;">
      <tr style="background:#fffbeb;">
        <th align="left" style="padding:8px 10px;font-size:12px;color:#92400e;">Date</th>
        <th align="left" style="padding:8px 10px;font-size:12px;color:#92400e;">Meals</th>
        <th align="right" style="padding:8px 10px;font-size:12px;color:#92400e;">Cost</th>
      </tr>
      ${tableRows}
    </table>`;

  return {
    subject: `Auto order set - runs until ${formatDate(lastMeal)} - ${BRAND()}`,
    text: `Hi ${name}, your auto order is set. It starts on ${formatDate(plan.startDate)} and runs until ${formatDate(
      lastMeal
    )} (${mealDays.length} meal day(s), ${leaveDays.length} leave day(s)). Total ${money(
      plan.totalCost
    )}. Balance left ${money(customer.currentBalance)}.`,
    html: layout({
      heading: "Your auto order is set 🍽️",
      intro: `Hi ${esc(name)}, your auto order has been created successfully. Your meals will be delivered automatically on the dates below.`,
      boxTitle: "Auto order details",
      highlight: { label: "Auto order runs until", value: formatDate(lastMeal) },
      rows: [
        ["Starts on", formatDate(plan.startDate)],
        ["Ends on", formatDate(lastMeal)],
        ["Meal days", String(mealDays.length)],
        ["Leave days", String(leaveDays.length)],
        ["Total cost", money(plan.totalCost)],
        ["Balance left", money(customer.currentBalance)],
      ],
      extraHtml: table,
      outro: `You can edit any day from <strong>Set auto order</strong> before the cut-off time (breakfast &amp; lunch 7 PM, dinner 9 PM the day before).<br/><br/>Thank you,<br/>${esc(BRAND())}`,
    }),
  };
};

const lowBalanceEmail = (customer, balance, { daily = false } = {}) => {
  const name = customer.name || "Customer";
  const balanceText = money(balance);
  return {
    subject: daily
      ? `Daily reminder: low balance - ${BRAND()}`
      : `Low balance alert - ${BRAND()}`,
    text: `Hi ${name}, your ${BRAND()} balance is ${balanceText}, which is ₹${LOW_BALANCE_EMAIL_AT} or below. Please add a payment to keep ordering without interruption.`,
    html: layout({
      accent: "#dc2626",
      heading: daily ? "Daily balance reminder ⚠️" : "Low balance alert ⚠️",
      intro: `Hi ${esc(name)}, your balance is ₹${LOW_BALANCE_EMAIL_AT} or below.`,
      boxTitle: "Account balance",
      highlight: { label: "Current balance", value: balanceText },
      rows: [
        ["Customer ID", customer.customerId || "—"],
        ["Minimum balance", money(LOW_BALANCE_EMAIL_AT)],
      ],
      outro: `Please add a payment to keep ordering without interruption.${
        daily ? " You will get this reminder daily until your balance is back above the minimum." : ""
      }<br/><br/>Thank you,<br/>${esc(BRAND())}`,
    }),
  };
};

/* Sends a template email; never throws. Resolves true when sent, false otherwise. */
const trySend = async (to, mail) => {
  if (!to) return false;
  try {
    await sendEmail({ to, ...mail });
    return true;
  } catch (err) {
    console.error("Email failed:", err.message);
    return false;
  }
};

module.exports = sendEmail;
module.exports.LOW_BALANCE_EMAIL_AT = LOW_BALANCE_EMAIL_AT;
module.exports.trySend = trySend;
module.exports.welcomeEmail = welcomeEmail;
module.exports.loginEmail = loginEmail;
module.exports.orderEmail = orderEmail;
module.exports.autoOrderEmail = autoOrderEmail;
module.exports.lowBalanceEmail = lowBalanceEmail;
