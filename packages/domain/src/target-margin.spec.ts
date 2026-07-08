import { resolveTargetMargin } from "./target-margin";

describe("resolveTargetMargin", () => {
  it("prefers the service-level margin when set", () => {
    const resolved = resolveTargetMargin({
      serviceTargetMargin: 0.2,
      profitCenterTargetMargin: 0.15,
      hospitalDefaultTargetMargin: 0.1,
    });
    expect(resolved.toNumber()).toBe(0.2);
  });

  it("falls back to profit-center margin when service margin is unset", () => {
    const resolved = resolveTargetMargin({
      profitCenterTargetMargin: 0.15,
      hospitalDefaultTargetMargin: 0.1,
    });
    expect(resolved.toNumber()).toBe(0.15);
  });

  it("falls back to the hospital default when neither override is set", () => {
    const resolved = resolveTargetMargin({ hospitalDefaultTargetMargin: 0.1 });
    expect(resolved.toNumber()).toBe(0.1);
  });
});
