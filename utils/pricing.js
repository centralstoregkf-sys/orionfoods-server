const PRICE = { breakfast: 70, lunch: 80, dinner: 90 };
const AUTO_DAYS = 10;
const FULL_DAY_PRICE = 200;
const TWO_MEAL_PRICE = 145;

const normalCost = (b, l, d) => b * PRICE.breakfast + l * PRICE.lunch + d * PRICE.dinner;

const autoDayCost = (b, l, d) => {
  const bb = b > 0 ? 1 : 0;
  const ll = l > 0 ? 1 : 0;
  const dd = d > 0 ? 1 : 0;
  const n = bb + ll + dd;
  if (n === 3) return FULL_DAY_PRICE;
  if (n === 2) return TWO_MEAL_PRICE;
  return normalCost(bb, ll, dd);
};

module.exports = { PRICE, AUTO_DAYS, FULL_DAY_PRICE, TWO_MEAL_PRICE, normalCost, autoDayCost };
