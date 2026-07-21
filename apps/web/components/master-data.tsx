"use client";

import { useState } from "react";
import { PageHeader } from "@hpp/ui";
import { masterDataEntities } from "../lib/master-data-entities";
import { MasterDataTable } from "./master-data-table";

/**
 * Entity switcher + generic table, per the confirmed design decision: one
 * `/master-data` route covering all entities rather than a route each.
 * `masterDataEntities` grows across sub-tasks 1-3 (see its doc comment).
 */
export function MasterData() {
  const [activeKey, setActiveKey] = useState(masterDataEntities[0]?.key);
  const activeEntity = masterDataEntities.find((entity) => entity.key === activeKey) ?? masterDataEntities[0];

  return (
    <>
      <PageHeader title="Master Data" description="Kelola data induk cost center, profit center, driver, tarif, dan lainnya." />

      <div className="mb-4 flex gap-1 border-b border-border" role="tablist">
        {masterDataEntities.map((entity) => (
          <button
            key={entity.key}
            type="button"
            role="tab"
            aria-selected={entity.key === activeEntity?.key}
            onClick={() => setActiveKey(entity.key)}
            className={`px-4 py-2 text-sm font-medium ${
              entity.key === activeEntity?.key
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {entity.label}
          </button>
        ))}
      </div>

      {activeEntity ? <MasterDataTable key={activeEntity.key} config={activeEntity} /> : null}
    </>
  );
}
