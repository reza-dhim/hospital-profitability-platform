import { UploadPipelineProcessor } from "./upload-pipeline.processor";
import type { ParseService } from "./parse.service";
import type { ValidateService } from "./validate.service";
import type { Job } from "bullmq";

function makeJob(name: string, data: object): Job {
  return { name, data } as Job;
}

function makeServices() {
  const parseService = { processUpload: jest.fn().mockResolvedValue(undefined) } as unknown as ParseService;
  const validateService = { processValidate: jest.fn().mockResolvedValue(undefined) } as unknown as ValidateService;
  return { parseService, validateService };
}

describe("UploadPipelineProcessor", () => {
  it("dispatches an 'upload.parse' job to ParseService.processUpload", async () => {
    const { parseService, validateService } = makeServices();
    const processor = new UploadPipelineProcessor(parseService, validateService);
    const jobData = { uploadBatchId: "batch-1", hospitalId: "h-1", organizationId: "o-1", uploadedByUserId: "u-1" };

    await processor.process(makeJob("upload.parse", jobData));

    expect(parseService.processUpload).toHaveBeenCalledWith(jobData);
    expect(validateService.processValidate).not.toHaveBeenCalled();
  });

  it("dispatches an 'upload.validate' job to ValidateService.processValidate", async () => {
    const { parseService, validateService } = makeServices();
    const processor = new UploadPipelineProcessor(parseService, validateService);
    const jobData = { uploadBatchId: "batch-1", hospitalId: "h-1", organizationId: "o-1", uploadedByUserId: "u-1" };

    await processor.process(makeJob("upload.validate", jobData));

    expect(validateService.processValidate).toHaveBeenCalledWith(jobData);
    expect(parseService.processUpload).not.toHaveBeenCalled();
  });

  it("does not throw and does not call either service for an unrecognized job name (logs and moves on)", async () => {
    const { parseService, validateService } = makeServices();
    const processor = new UploadPipelineProcessor(parseService, validateService);

    await expect(processor.process(makeJob("some.other.job", {}))).resolves.toBeUndefined();
    expect(parseService.processUpload).not.toHaveBeenCalled();
    expect(validateService.processValidate).not.toHaveBeenCalled();
  });
});
