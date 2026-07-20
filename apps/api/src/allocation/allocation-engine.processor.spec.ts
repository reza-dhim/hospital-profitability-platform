import { AllocationEngineProcessor } from "./allocation-engine.processor";
import type { AllocationEngineService } from "./allocation-engine.service";
import type { ProfitabilityEngineService } from "../profitability/profitability-engine.service";
import type { Job } from "bullmq";

function makeJob(name: string, data: object): Job {
  return { name, data } as Job;
}

function makeServices() {
  const allocationEngineService = { processRun: jest.fn().mockResolvedValue(undefined) } as unknown as AllocationEngineService;
  const profitabilityEngineService = { processRun: jest.fn().mockResolvedValue(undefined) } as unknown as ProfitabilityEngineService;
  return { allocationEngineService, profitabilityEngineService };
}

describe("AllocationEngineProcessor", () => {
  it("dispatches an 'allocation.run' job to AllocationEngineService.processRun", async () => {
    const { allocationEngineService, profitabilityEngineService } = makeServices();
    const processor = new AllocationEngineProcessor(allocationEngineService, profitabilityEngineService);
    const jobData = { allocationRunId: "run-1", hospitalId: "h-1", organizationId: "o-1", actorUserId: "u-1" };

    await processor.process(makeJob("allocation.run", jobData));

    expect(allocationEngineService.processRun).toHaveBeenCalledWith(jobData);
    expect(profitabilityEngineService.processRun).not.toHaveBeenCalled();
  });

  it("dispatches a 'profitability.compute' job to ProfitabilityEngineService.processRun", async () => {
    const { allocationEngineService, profitabilityEngineService } = makeServices();
    const processor = new AllocationEngineProcessor(allocationEngineService, profitabilityEngineService);
    const jobData = { allocationRunId: "run-1", hospitalId: "h-1", organizationId: "o-1", actorUserId: "u-1" };

    await processor.process(makeJob("profitability.compute", jobData));

    expect(profitabilityEngineService.processRun).toHaveBeenCalledWith(jobData);
    expect(allocationEngineService.processRun).not.toHaveBeenCalled();
  });

  it("does not throw and does not call either service for an unrecognized job name (logs and moves on)", async () => {
    const { allocationEngineService, profitabilityEngineService } = makeServices();
    const processor = new AllocationEngineProcessor(allocationEngineService, profitabilityEngineService);

    await expect(processor.process(makeJob("some.other.job", {}))).resolves.toBeUndefined();
    expect(allocationEngineService.processRun).not.toHaveBeenCalled();
    expect(profitabilityEngineService.processRun).not.toHaveBeenCalled();
  });
});
