import { getWorkerJob, WorkerJob } from "./jobRegistry";

export function handleGetWorkerJob(jobId: string): { job: WorkerJob | null; error?: string } {
  if (!jobId || typeof jobId !== "string") {
    return { job: null, error: "Job ID required." };
  }

  const job = getWorkerJob(jobId);
  if (!job) {
    return { job: null, error: "Job not found." };
  }

  return { job };
}
