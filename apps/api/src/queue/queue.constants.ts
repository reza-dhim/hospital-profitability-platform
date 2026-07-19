/**
 * Single queue for the whole upload pipeline (docs/06_UPLOAD_ENGINE.md §2:
 * parse, then validate — both async via BullMQ). Distinguished by BullMQ job
 * `name` (e.g. `upload.parse`, `upload.validate`, added by the sub-tasks
 * that own each stage) rather than one queue per stage — no cross-queue
 * ordering/backpressure coordination needed since each upload batch's jobs
 * are already sequential by construction (validate is enqueued by the parse
 * job's completion, not run in parallel with it).
 */
export const UPLOAD_QUEUE_NAME = "upload-pipeline";

/**
 * Dedicated queue for the Cost Allocation Engine (Sprint 5,
 * docs/08_COST_ALLOCATION_ENGINE.md), separate from `upload-pipeline` — an
 * allocation run's compute cost (loading all cost_entries/driver_values for
 * a period, running Direct/Step-Down in memory) is a different workload
 * shape from upload parsing/validation and shouldn't compete with it for
 * worker concurrency.
 */
export const ALLOCATION_QUEUE_NAME = "allocation-engine";
