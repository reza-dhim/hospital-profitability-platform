import { Injectable } from "@nestjs/common";

export interface VirusScanResult {
  clean: boolean;
}

export interface VirusScanner {
  scan(buffer: Buffer): Promise<VirusScanResult>;
}

/** Injection token — lets a real scanner replace `StubVirusScanner` later without touching any consumer. */
export const VIRUS_SCANNER = Symbol("VIRUS_SCANNER");

/**
 * TODO(Sprint 4 follow-up): replace with a real ClamAV-backed implementation
 * (docs/06_UPLOAD_ENGINE.md §4 — "Virus scan on upload... before the file is
 * queued for parsing"). Deferred per the Sprint 4 kickoff decision: standing
 * up a scanning sidecar is a separate, heavier infra addition than this
 * sub-task's scope, and the pipeline shape (scan -> reject-if-infected
 * before storage) is already correct here — only the scan implementation
 * itself is a stub.
 */
@Injectable()
export class StubVirusScanner implements VirusScanner {
  async scan(_buffer: Buffer): Promise<VirusScanResult> {
    return { clean: true };
  }
}
