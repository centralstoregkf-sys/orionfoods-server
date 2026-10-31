const { fail } = require("./httpError");

const DELIVERY_PINCODE = "683565";

const isDeliverable = (pincode) => String(pincode || "").trim() === DELIVERY_PINCODE;

const assertDeliverable = (customer) => {
  if (isDeliverable(customer.pincode)) return;
  if (customer.pincode) {
    fail(
      400,
      `Sorry, we deliver only to pincode ${DELIVERY_PINCODE}. Your pincode ${customer.pincode} is not valid for delivery. Please change your pincode in your Profile.`
    );
  }
  fail(400, `We deliver only to pincode ${DELIVERY_PINCODE}. Please add your pincode in your Profile.`);
};

const blank = (v) => v === undefined || v === null || String(v).trim() === "";

const sanitizeLocation = (body) => {
  const src = body || {};
  if (blank(src.lat) || blank(src.lng)) fail(400, "Enter a valid latitude and longitude");
  const lat = Number(src.lat);
  const lng = Number(src.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    fail(400, "Enter a valid latitude and longitude");
  }
  const note = String(src.note || "").trim().slice(0, 200);

  const loc = { lat, lng, note, updatedAt: new Date() };
  if (!blank(src.accuracy)) {
    const accuracy = Number(src.accuracy);
    if (Number.isFinite(accuracy) && accuracy >= 0) loc.accuracy = Math.round(accuracy);
  }
  return loc;
};

module.exports = { DELIVERY_PINCODE, isDeliverable, assertDeliverable, sanitizeLocation };
