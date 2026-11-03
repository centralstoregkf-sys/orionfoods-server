const { fail } = require("./httpError");

const DELIVERY_PINCODE = "683565";

/* Hotel, Pallikkara. REPLACE with the exact hotel coordinates (same value as the frontend file). */
const HOTEL_LOCATION = { lat: 10.011, lng: 76.425 };

/* Maximum delivery distance from the hotel, in km */
const MAX_DELIVERY_KM = 8;

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

/* Straight-line distance in km (haversine) */
const distanceKm = (lat1, lng1, lat2, lng2) => {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const distanceFromHotel = (lat, lng) =>
  distanceKm(lat, lng, HOTEL_LOCATION.lat, HOTEL_LOCATION.lng);

/* Finds the 6-digit pincode of a map point (OpenStreetMap Nominatim). Returns null if unknown. */
const resolvePincode = async (lat, lng) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ORION-Foods/1.0 (meal ordering app)",
        "Accept-Language": "en",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const match = String((data && data.address && data.address.postcode) || "").match(/(\d{3})\s?(\d{3})/);
    return match ? `${match[1]}${match[2]}` : null;
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/* Throws if the spot is too far from the hotel or outside the delivery pincode.
   Returns the verified pincode. */
const assertLocationDeliverable = async (lat, lng) => {
  const km = distanceFromHotel(lat, lng);
  if (km > MAX_DELIVERY_KM) {
    fail(
      400,
      `This location is ${km.toFixed(1)} km away from our hotel. We deliver only within ${MAX_DELIVERY_KM} km, so it can't be used for delivery.`
    );
  }

  const pincode = await resolvePincode(lat, lng);
  if (!pincode) {
    fail(502, "Couldn't verify the pincode of this spot. Please move the pin a little and try again.");
  }
  if (!isDeliverable(pincode)) {
    fail(
      400,
      `Sorry, we deliver only to pincode ${DELIVERY_PINCODE}. This location is in pincode ${pincode}, so it can't be used for delivery.`
    );
  }
  return pincode;
};

module.exports = {
  DELIVERY_PINCODE,
  HOTEL_LOCATION,
  MAX_DELIVERY_KM,
  isDeliverable,
  assertDeliverable,
  sanitizeLocation,
  distanceKm,
  distanceFromHotel,
  resolvePincode,
  assertLocationDeliverable,
};
