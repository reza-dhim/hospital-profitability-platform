import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { vi } from "vitest";

/**
 * jsdom has no real canvas 2D context, and ECharts' internal render loop is
 * `requestAnimationFrame`-driven — under test, that async work can still be
 * in flight when Testing Library's automatic per-test cleanup unmounts the
 * component, throwing an unhandled rejection on the now-null canvas layer
 * ("Cannot set properties of null (setting 'dpr')"). Components are tested
 * for correct data wiring, not ECharts' own rendering, so replace it with a
 * synchronous stub everywhere.
 */
vi.mock("echarts-for-react", () => ({
  default: ({ option }: { option: unknown }) =>
    createElement("div", { "data-testid": "echarts-stub", "data-option": JSON.stringify(option) }),
}));
