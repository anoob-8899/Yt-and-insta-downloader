import {
  getWorkerJob,
  saveWorkerJob,
  updateWorkerJobProgress,
  setWorkerJobFailed,
} from "./jobRegistry";
import { defaultMediaProcessor } from "../media/processor";
import { getFFmpegProfile } from "../media/formats";
import { createDownloadToken, safeDeleteFile } from "../storage/temporaryStorage";
import { WORKER_LIMITS } from "../security/limits";

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

    updateWorkerJobProgress(jobId, 10, "Job queued for execution...", "PROCESSING");

    // 2. Fetch/download source media with safety checks
    const sourceResult = await defaultMediaProcessor.fetchSourceMedia(
      job.sourceUrl,
      jobId,
      (pct, msg) => {
        updateWorkerJobProgress(jobId, pct, msg);
      }
    );
    sourcePath = sourceResult.sourcePath;

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

    updateWorkerJobProgress(jobId, 95, "Finalizing temporary output...");

    // 4. Create safe download token and reference
    const safeFilename = `mediaflow_${jobId.substring(0, 8)}.${profile.outputExtension}`;
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
    saveWorkerJob(job);
  } catch (err: any) {
    console.error(`[JOB ${jobId}] Processing error:`, err);

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
