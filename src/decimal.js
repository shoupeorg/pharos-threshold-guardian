const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.(\d+))?$/;

export function parseUnits(value, decimals, label = "value") {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error(`${label} decimals must be an integer from 0 to 255`);
  }
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    throw new Error(`${label} must be a non-negative decimal string`);
  }
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) {
    throw new Error(`${label} supports at most ${decimals} decimal places`);
  }
  return BigInt(whole) * 10n ** BigInt(decimals)
    + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
}

export function formatUnits(value, decimals) {
  const raw = typeof value === "bigint" ? value : BigInt(value);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error("decimals must be an integer from 0 to 255");
  }
  const negative = raw < 0n;
  const absolute = negative ? -raw : raw;
  if (decimals === 0) return `${negative ? "-" : ""}${absolute}`;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = (absolute % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function hexQuantity(value, label = "hex quantity") {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return BigInt(value);
}
