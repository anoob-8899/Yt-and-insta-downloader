export type WorkerJobState = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "EXPIRED";

export interface WorkerJob {
  id: string;
  sourceUrl: string;
  mediaType: "video" | "audio";
  format: "mp4" | "mp3" | "m4a";
  quality: string;
  requestedQuality?: string;
  actualQuality?: string;
  sourcePlatform?: string;
  sourceId?: string;
  requestedFormat?: string;
  actualFormat?: string;
  acquisitionStartedAt?: number;
  processingStartedAt?: number;
  completedAt?: number;
  status: WorkerJobState;
  progress: number; // 0 to 100
  stepMessage: string;
  downloadToken?: string;
  downloadUrl?: string;
  filename?: string;
  mimeType?: string;
  outputPath?: string;
  error?: string;
  errorCode?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

const jobs = new Map<string, WorkerJob>();

export function saveWorkerJob(job: WorkerJob): void {
  job.updatedAt = Date.now();
  jobs.set(job.id, job);
}

export function getWorkerJob(id: string): WorkerJob | undefined {
  return jobs.get(id);
}

export function updateWorkerJobProgress(
  id: string,
  progress: number,
  stepMessage?: string,
  status?: WorkerJobState
): void {
  const job = jobs.get(id);
  if (job) {
    job.progress = Math.min(100, Math.max(0, progress));
    if (stepMessage) job.stepMessage = stepMessage;
    if (status) job.status = status;
    job.updatedAt = Date.now();
    jobs.set(id, job);
  }
}

export function setWorkerJobFailed(id: string, error: string, errorCode: string = "PROCESSING_FAILED"): void {
  const job = jobs.get(id);
  if (job) {
    job.status = "FAILED";
    job.error = error;
    job.errorCode = errorCode;
    job.stepMessage = "Media processing failed.";
    job.updatedAt = Date.now();
    jobs.set(id, job);
  }
}

export function getAllWorkerJobs(): WorkerJob[] {
  return Array.from(jobs.values());
}
