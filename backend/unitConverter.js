const CONVERSION_RATES = {
  kg: { g: 1000, kg: 1 },
  g: { kg: 0.001, g: 1 },
  l: { ml: 1000, l: 1 },
  ml: { l: 0.001, ml: 1 },
  piece: { piece: 1 },
  pack: { pack: 1 }
};

export const convertUnit = (amount, fromUnit, toUnit) => {
  if (fromUnit === toUnit) return amount;
  if (!CONVERSION_RATES[fromUnit] || !CONVERSION_RATES[fromUnit][toUnit]) {
    throw new Error(`تحويل غير مدعوم من ${fromUnit} إلى ${toUnit}`);
  }
  return amount * CONVERSION_RATES[fromUnit][toUnit];
};