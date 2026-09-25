import crypto from "crypto";
import { validateWorkerJobInput } from "../media/validation";
import { WorkerJob, saveWorkerJob } from "./jobRegistry";
import { executeWorkerJob } from "./processJob";

export interface CreateJobResult {
  success: boolean;
  job?: WorkerJob;
  error?: string;
  errorCode?: string;
  statusCode?: number;
}

export function handleCreateWorkerJob(body: any): CreateJobResult {
  const validation = validateWorkerJobInput(body);

  if (!validation.isValid || !validation.url || !validation.mediaType || !validation.format || !validation.quality) {
    return {
      success: false,
      error: validation.error || "Invalid request parameters.",
      errorCode: validation.errorCode || "INVALID_REQUEST",
      statusCode: 400,
    };
  }

  const jobId = `job_${crypto.randomBytes(12).toString("hex")}`;
  const now = Date.now();

  const newJob: WorkerJob = {
    id: jobId,
    sourceUrl: validation.url,
    mediaType: validation.mediaType,
    format: validation.format,
    quality: validation.quality,
    status: "QUEUED",
    progress: 0,
    stepMessage: "Job received and queued for worker processing...",
    createdAt: now,
    updatedAt: now,
  };

  saveWorkerJob(newJob);

  // Trigger non-blocking async execution on worker thread pool
  setImmediate(() => {
    executeWorkerJob(jobId).catch((err) => {
      console.error(`[JOB ${jobId}] Unhandled async error:`, err);
    });
  });

  return {
    success: true,
    job: newJob,
  };
}
