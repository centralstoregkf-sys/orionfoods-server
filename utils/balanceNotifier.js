const sendEmail = require("./sendEmail");

const MIN_BALANCE = 500;

// Works whether Customer stores email itself or links to a User
const getRecipient = async (customer) => {
  if (customer.email) {
    return { email: customer.email, name: customer.name || "Customer" };
  }
  if (!customer.user?.email) {
    await customer.populate("user", "name email");
  }
  return {
    email: customer.user?.email,
    name: customer.user?.name || customer.name || "Customer",
  };
};

const wrap = (title, body) => `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #eee;border-radius:8px;overflow:hidden">
    <div style="background:#f97316;color:#fff;padding:16px 20px;font-size:20px;font-weight:bold">ORION Foods</div>
    <div style="padding:20px;color:#333">
      <h2 style="margin-top:0">${title}</h2>
      ${body}
      <p style="margin-top:24px;color:#888;font-size:12px">This is an automated message from ORION Foods.</p>
    </div>
  </div>`;

const safeSend = async (customer, buildMail) => {
  try {
    const { email, name } = await getRecipient(customer);
    if (!email) return;
    const { subject, html, text } = buildMail(name);
    await sendEmail({ to: email, subject, html, text });
  } catch (err) {
    // Never break the main request because of an email failure
    console.error("Balance email failed:", err.message);
  }
};

// 1) On registration: balance is 0
exports.notifyRegistration = (customer) =>
  safeSend(customer, (name) => ({
    subject: "Welcome to ORION Foods – add a payment to start ordering",
    text: `Hi ${name}, welcome to ORION Foods! Your balance is ₹0. Please add a payment of ₹${MIN_BALANCE} or more to start placing orders.`,
    html: wrap(
      `Welcome, ${name}!`,
      `<p>Your account has been created successfully.</p>
       <p>Your current balance is <b>₹0</b>.</p>
       <p>Please add a payment of <b>₹${MIN_BALANCE} or more</b> to start placing orders.</p>`
    ),
  }));

const lowBalanceMail = (name, balance) => ({
  subject: "Low balance alert – ORION Foods",
  text: `Hi ${name}, your balance is ₹${balance}, which is below ₹${MIN_BALANCE}. Please add a payment to continue ordering.`,
  html: wrap(
    "Low balance alert",
    `<p>Hi ${name},</p>
     <p>Your current balance is <b style="color:#dc2626">₹${balance}</b>, which is below the minimum of <b>₹${MIN_BALANCE}</b>.</p>
     <p>You cannot place new orders until you add a payment.</p>`
  ),
});

// 2) After a payment: send only if balance is still below minimum
exports.notifyAfterPayment = (customer) => {
  if (Number(customer.currentBalance) >= MIN_BALANCE) return Promise.resolve();
  return safeSend(customer, (name) =>
    lowBalanceMail(name, customer.currentBalance)
  );
};

// 3) After an order: send only when balance crosses from >= 500 to < 500
exports.notifyAfterOrder = (customer, previousBalance) => {
  const now = Number(customer.currentBalance);
  if (!(Number(previousBalance) >= MIN_BALANCE && now < MIN_BALANCE)) {
    return Promise.resolve();
  }
  return safeSend(customer, (name) => lowBalanceMail(name, now));
};

exports.MIN_BALANCE = MIN_BALANCE;