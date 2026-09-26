import { DownloadRequest, ErrorCode, JobResponse, JobStatus } from "./types";
import { validateMediaUrl, validateDownloadOptions } from "./validation";

function mapWorkerStateToJobStatus(workerState: string): JobStatus {
  switch (workerState) {
    case "QUEUED":
      return "pending";
    case "PROCESSING":
      return "processing";
    case "COMPLETED":
      return "completed";
    case "FAILED":
    case "EXPIRED":
      return "failed";
    default:
      return "preparing";
  }
}

/**
 * Creates a media processing job by delegating to the Media Worker service.
 */
export async function createDownloadJob(req: DownloadRequest): Promise<JobResponse> {
  const urlValidation = validateMediaUrl(req.sourceUrl);
  if (!urlValidation.isValid || !urlValidation.normalizedUrl) {
    return {
      jobId: "",
      status: "failed",
      progress: 0,
      error: urlValidation.error || "Invalid URL provided.",
      errorCode: "INVALID_URL",
      workerConfigured: false,
    };
  }

  const optionsValidation = validateDownloadOptions(req.mediaType, req.format, req.quality);
  if (!optionsValidation.isValid) {
    return {
      jobId: "",
      status: "failed",
      progress: 0,
      error: optionsValidation.error || "Invalid format or quality option.",
      errorCode: optionsValidation.errorCode || "UNSUPPORTED_FORMAT",
      workerConfigured: false,
    };
  }

  const workerUrl = process.env.MEDIA_WORKER_URL;
  const isWorkerConfigured = Boolean(workerUrl && workerUrl.trim().length > 0);

  if (!isWorkerConfigured) {
    return {
      jobId: `job_${Date.now()}`,
      status: "worker_unconfigured",
      progress: 0,
      error:
        "Media Processing Worker is not configured. Please configure MEDIA_WORKER_URL to process media downloads.",
      errorCode: "WORKER_UNCONFIGURED",
      workerConfigured: false,
    };
  }

  try {
    const workerRes = await fetch(`${workerUrl}/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mediaflow-Secret": process.env.MEDIA_WORKER_SECRET || "",
      },
      body: JSON.stringify({
        url: urlValidation.normalizedUrl,
        mediaType: req.mediaType,
        format: req.format,
        quality: req.quality,
      }),
      cache: "no-store",
    });

    if (!workerRes.ok) {
      const errJson = await workerRes.json().catch(() => ({}));
      return {
        jobId: "",
        status: "failed",
        progress: 0,
        error: errJson.error || errJson.message || "Media worker rejected processing job.",
        errorCode: errJson.code || "PROCESSING_FAILED",
        workerConfigured: true,
      };
    }

    const workerJob = await workerRes.json();
    return {
      jobId: workerJob.id,
      status: mapWorkerStateToJobStatus(workerJob.status),
      progress: workerJob.progress ?? 0,
      stepMessage: workerJob.stepMessage || "Job queued for worker processing...",
      requestedQuality: workerJob.requestedQuality,
      actualQuality: workerJob.actualQuality,
      workerConfigured: true,
    };
  } catch {
    return {
      jobId: "",
      status: "failed",
      progress: 0,
      error: "Unable to communicate with Media Worker backend.",
      errorCode: "NETWORK_FAILURE",
      workerConfigured: true,
    };
  }
}

/**
 * Retrieves current job status from Media Worker by ID.
 */
export async function getJobStatus(jobId: string): Promise<JobResponse> {
  const workerUrl = process.env.MEDIA_WORKER_URL;
  const isWorkerConfigured = Boolean(workerUrl && workerUrl.trim().length > 0);

  if (!isWorkerConfigured) {
    return {
      jobId,
      status: "worker_unconfigured",
      progress: 0,
      error: "Media processing worker is not configured.",
      errorCode: "WORKER_UNCONFIGURED",
      workerConfigured: false,
    };
  }

  try {
    const workerRes = await fetch(`${workerUrl}/jobs/${jobId}`, {
      headers: {
        "X-Mediaflow-Secret": process.env.MEDIA_WORKER_SECRET || "",
      },
      cache: "no-store",
    });

    if (!workerRes.ok) {
      const errJson = await workerRes.json().catch(() => ({}));
      return {
        jobId,
        status: "failed",
        progress: 0,
        error: errJson.error || errJson.message || "Job not found or worker error.",
        errorCode: errJson.code || "PROCESSING_FAILED",
        workerConfigured: true,
      };
    }

    const jobData = await workerRes.json();
    return {
      jobId: jobData.id,
      status: mapWorkerStateToJobStatus(jobData.status),
      progress: jobData.progress ?? 0,
      stepMessage: jobData.stepMessage,
      downloadUrl: jobData.downloadUrl,
      filename: jobData.filename,
      requestedQuality: jobData.requestedQuality,
      actualQuality: jobData.actualQuality,
      error: jobData.error,
      errorCode: jobData.errorCode,
      workerConfigured: true,
    };
  } catch {
    return {
      jobId,
      status: "failed",
      progress: 0,
      error: "Failed to poll worker job status.",
      errorCode: "NETWORK_FAILURE",
      workerConfigured: true,
    };
  }
}
