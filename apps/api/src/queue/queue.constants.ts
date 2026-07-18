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
