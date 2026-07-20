import { describe, expect, it } from "vitest";
import { getVisibleNavItems, type NavItem } from "./nav";

const items: NavItem[] = [
  { label: "Single", href: "/single", requiredPermission: "single.read" },
  { label: "Either", href: "/either", requiredPermission: ["a.read", "b.read"] },
];

describe("getVisibleNavItems", () => {
  it("includes an item whose single required permission is granted", () => {
    expect(getVisibleNavItems(items, ["single.read"]).map((i) => i.label)).toContain("Single");
  });

  it("excludes an item whose required permission is missing", () => {
    expect(getVisibleNavItems(items, []).map((i) => i.label)).not.toContain("Single");
  });

  it("includes an OR-gated item when only one of its permissions is granted", () => {
    expect(getVisibleNavItems(items, ["b.read"]).map((i) => i.label)).toContain("Either");
  });

  it("excludes an OR-gated item when none of its permissions are granted", () => {
    expect(getVisibleNavItems(items, ["single.read"]).map((i) => i.label)).not.toContain("Either");
  });

  it("returns an empty list for an unauthenticated/no-permission user", () => {
    expect(getVisibleNavItems(items, [])).toEqual([]);
  });
});
