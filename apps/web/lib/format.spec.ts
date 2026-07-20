import { describe, expect, it } from "vitest";
import { formatCurrencyIDR, formatDateTime, formatPercent, trendFromVariance } from "./format";

describe("formatCurrencyIDR", () => {
  it("formats a positive amount as Indonesian Rupiah with no decimals", () => {
    expect(formatCurrencyIDR("1234567")).toMatch(/Rp\s?1\.234\.567/);
  });

  it("formats zero", () => {
    expect(formatCurrencyIDR(0)).toMatch(/Rp\s?0/);
  });
});

describe("formatPercent", () => {
  it("formats a percentage value already scaled by @hpp/domain's margin()/variance() (no re-scaling)", () => {
    expect(formatPercent("15.2345")).toBe("15.2%");
  });

  it("respects a custom fraction-digit count", () => {
    expect(formatPercent("15.2345", 2)).toBe("15.23%");
  });
});

describe("formatDateTime", () => {
  it("formats an ISO string as an Indonesian medium date + short time", () => {
    expect(formatDateTime("2026-01-15T08:30:00.000Z")).toMatch(/2026/);
  });

  it("accepts a Date instance directly", () => {
    expect(formatDateTime(new Date("2026-01-15T08:30:00.000Z"))).toMatch(/2026/);
  });
});

describe("trendFromVariance", () => {
  it("returns null when variance is null", () => {
    expect(trendFromVariance(null, String)).toBeNull();
  });

  it("marks a positive delta 'up' with a leading plus sign", () => {
    const trend = trendFromVariance({ absolute: "500000", percentage: "12.5" }, formatCurrencyIDR);
    expect(trend?.direction).toBe("up");
    expect(trend?.label).toMatch(/^\+Rp\s?500\.000 \(\+12\.5%\)$/);
  });

  it("marks a negative delta 'down' without a double-negative sign", () => {
    const trend = trendFromVariance({ absolute: "-500000", percentage: "-12.5" }, formatCurrencyIDR);
    expect(trend?.direction).toBe("down");
    expect(trend?.label).toContain("-12.5%");
  });

  it("marks a zero delta 'flat'", () => {
    const trend = trendFromVariance({ absolute: "0", percentage: "0" }, formatCurrencyIDR);
    expect(trend?.direction).toBe("flat");
  });

  it("omits the percentage suffix when percentage is null (prior value was zero)", () => {
    const trend = trendFromVariance({ absolute: "500000", percentage: null }, formatCurrencyIDR);
    expect(trend?.label).not.toContain("(");
  });
});
