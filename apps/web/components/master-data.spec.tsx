import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MasterData } from "./master-data";
import { masterDataEntities } from "../lib/master-data-entities";

vi.mock("./master-data-table", () => ({
  MasterDataTable: ({ config }: { config: { label: string } }) => <div data-testid="master-data-table">{config.label}</div>,
}));

describe("MasterData", () => {
  it("renders the page header and a tab per entity, defaulting to the first", () => {
    const firstEntity = masterDataEntities[0];
    if (!firstEntity) throw new Error("masterDataEntities must not be empty");

    render(<MasterData />);

    expect(screen.getByText("Master Data")).toBeInTheDocument();
    for (const entity of masterDataEntities) {
      expect(screen.getByRole("tab", { name: entity.label })).toBeInTheDocument();
    }
    expect(screen.getByRole("tab", { name: firstEntity.label })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("master-data-table")).toHaveTextContent(firstEntity.label);
  });
});
