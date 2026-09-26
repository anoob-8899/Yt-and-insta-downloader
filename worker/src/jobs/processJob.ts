import {
  getWorkerJob,
  saveWorkerJob,
  updateWorkerJobProgress,
  setWorkerJobFailed,
} from "./jobRegistry";
import { defaultMediaProcessor } from "../media/processor";
import { getFFmpegProfile } from "../media/formats";
import { validateOutputFile } from "../media/validation";
import { createDownloadToken, safeDeleteFile } from "../storage/temporaryStorage";
import { terminateJobProcess } from "../media/sourceAcquirer";

/**
 * Generates safe, sanitized download filename based on title or fallback jobId.
 */
export function sanitizeDownloadFilename(title?: string, fallbackId?: string, ext: string = "mp4"): string {
  let baseName = "";
  if (title && typeof title === "string") {
    baseName = title
      .replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+/, "");
  }
  if (!baseName || baseName.length === 0) {
    baseName = `mediaflow_${(fallbackId || "media").substring(0, 8)}`;
  }
  if (baseName.length > 100) {
    baseName = baseName.substring(0, 100).trim();
  }
  return `${baseName}.${ext}`;
}

/**
 * Asynchronous job execution pipeline for authorized media processing.
 */
export async function executeWorkerJob(jobId: string): Promise<void> {
  const job = getWorkerJob(jobId);
  if (!job) return;

  let sourcePath: string | null = null;

  try {
    // 1. Validate FFmpeg profile
    const profile = getFFmpegProfile(job.mediaType, job.format, job.quality);
    if (!profile) {
      setWorkerJobFailed(jobId, "Unsupported format or quality profile.", "UNSUPPORTED_FORMAT");
      return;
    }

    job.requestedQuality = job.quality;
    job.requestedFormat = job.format;
    job.actualQuality = profile.quality;
    job.actualFormat = profile.outputExtension;
    job.acquisitionStartedAt = Date.now();

    updateWorkerJobProgress(jobId, 10, "Job queued for execution...", "PROCESSING");

    // 2. Fetch/acquire source media with safety checks and options
    const sourceResult = await defaultMediaProcessor.fetchSourceMedia(
      job.sourceUrl,
      jobId,
      {
        mediaType: job.mediaType,
        requestedQuality: job.quality,
      },
      (pct, msg) => {
        updateWorkerJobProgress(jobId, pct, msg);
      }
    );

    sourcePath = sourceResult.sourcePath;

    if (sourceResult.actualQuality) {
      job.actualQuality = sourceResult.actualQuality;
    }
    if (sourceResult.metadata) {
      job.sourcePlatform = sourceResult.metadata.sourceType;
      job.sourceId = sourceResult.metadata.id;
    }

    job.processingStartedAt = Date.now();
    updateWorkerJobProgress(jobId, 40, "Encoding media with FFmpeg...");

    // 3. Process media with FFmpeg
    const onFFmpegProgress = (pct: number) => {
      // Scale FFmpeg progress from 40% to 90%
      const scaledProgress = 40 + Math.round((pct / 100) * 50);
      updateWorkerJobProgress(jobId, scaledProgress, `Encoding media (${pct}%)...`);
    };

    let outputPath: string;
    if (job.mediaType === "video") {
      outputPath = await defaultMediaProcessor.processVideo(
        sourcePath,
        jobId,
        profile,
        onFFmpegProgress
      );
    } else {
      outputPath = await defaultMediaProcessor.extractAudio(
        sourcePath,
        jobId,
        profile,
        onFFmpegProgress
      );
    }

    // 4. Output Validation
    const outputValidation = validateOutputFile(outputPath, profile.outputExtension);
    if (!outputValidation.isValid) {
      safeDeleteFile(outputPath);
      setWorkerJobFailed(
        jobId,
        outputValidation.error || "Output file validation failed.",
        outputValidation.errorCode || "STORAGE_FAILED"
      );
      return;
    }

    updateWorkerJobProgress(jobId, 95, "Finalizing temporary output...");

    // 5. Create safe download token and reference
    const safeFilename = sanitizeDownloadFilename(
      sourceResult.metadata?.title,
      jobId,
      profile.outputExtension
    );

    const tokenRecord = createDownloadToken(
      jobId,
      outputPath,
      safeFilename,
      profile.mimeType
    );

    const publicDownloadUrl = `/api/download/file/${tokenRecord.token}`;

    job.status = "COMPLETED";
    job.progress = 100;
    job.stepMessage = "Processing completed. Download ready.";
    job.downloadToken = tokenRecord.token;
    job.downloadUrl = publicDownloadUrl;
    job.filename = safeFilename;
    job.mimeType = profile.mimeType;
    job.outputPath = outputPath;
    job.expiresAt = tokenRecord.expiresAt;
    job.completedAt = Date.now();
    saveWorkerJob(job);
  } catch (err: any) {
    console.error(`[JOB ${jobId}] Processing error:`, err);

    terminateJobProcess(jobId);

    const errorMessage = err?.message || "An unexpected error occurred during media processing.";
    const errorCode = err?.errorCode || (err?.message === "PROCESSING_TIMEOUT" ? "PROCESSING_TIMEOUT" : "PROCESSING_FAILED");

    setWorkerJobFailed(jobId, errorMessage, errorCode);
  } finally {
    // Clean up temporary source input file to avoid storage leakage
    if (sourcePath) {
      safeDeleteFile(sourcePath);
    }
  }
}
