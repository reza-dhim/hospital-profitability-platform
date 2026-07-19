import { AllocationEngineProcessor } from "./allocation-engine.processor";
import type { AllocationEngineService } from "./allocation-engine.service";
import type { Job } from "bullmq";

function makeJob(name: string, data: object): Job {
  return { name, data } as Job;
}

function makeService() {
  return { processRun: jest.fn().mockResolvedValue(undefined) } as unknown as AllocationEngineService;
}

describe("AllocationEngineProcessor", () => {
  it("dispatches an 'allocation.run' job to AllocationEngineService.processRun", async () => {
    const allocationEngineService = makeService();
    const processor = new AllocationEngineProcessor(allocationEngineService);
    const jobData = { allocationRunId: "run-1", hospitalId: "h-1", organizationId: "o-1", actorUserId: "u-1" };

    await processor.process(makeJob("allocation.run", jobData));

    expect(allocationEngineService.processRun).toHaveBeenCalledWith(jobData);
  });

  it("does not throw and does not call the service for an unrecognized job name (logs and moves on)", async () => {
    const allocationEngineService = makeService();
    const processor = new AllocationEngineProcessor(allocationEngineService);

    await expect(processor.process(makeJob("some.other.job", {}))).resolves.toBeUndefined();
    expect(allocationEngineService.processRun).not.toHaveBeenCalled();
  });
});
