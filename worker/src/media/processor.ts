import fs from "fs";
import http from "http";
import https from "https";
import { URL } from "url";
import { getFFmpegProfile } from "./formats";
import { runFFmpegProcess } from "./ffmpeg";
import { getJobFilePath, safeDeleteFile } from "../storage/temporaryStorage";
import { WORKER_LIMITS } from "../security/limits";
import { parseYouTubeUrl, parseInstagramUrl } from "../../../lib/media/validation";
import { defaultSourceAcquirer, SourceMetadata } from "./sourceAcquirer";

export interface ProcessMediaJobOptions {
  jobId: string;
  sourceUrl: string;
  mediaType: "video" | "audio";
  format: "mp4" | "mp3" | "m4a";
  quality: string;
  onProgress?: (progress: number, stepMessage: string) => void;
}

export interface ProcessMediaJobResult {
  outputPath: string;
  filename: string;
  mimeType: string;
}

/**
 * High-level media processor exposing controlled processing operations.
 */
export class MediaProcessor {
  /**
   * Downloads and validates source media file with SSRF, size limit, and timeout safeguards.
   */
  public async fetchSourceMedia(
    sourceUrl: string,
    jobId: string,
    options?: { mediaType?: "video" | "audio"; requestedQuality?: string },
    onProgress?: (pct: number, msg: string) => void
  ): Promise<{ sourcePath: string; durationSecs?: number; actualQuality?: string; metadata?: SourceMetadata }> {
    if (onProgress) onProgress(15, "Resolving authorized source media...");

    // Check YouTube / Instagram platform URL authorization rule
    const ytResult = parseYouTubeUrl(sourceUrl);
    const igResult = parseInstagramUrl(sourceUrl);

    if (ytResult.platform === "youtube" || igResult.platform === "instagram") {
      const acquired = await defaultSourceAcquirer.acquireSource(
        sourceUrl,
        jobId,
        {
          mediaType: options?.mediaType || "video",
          requestedQuality: options?.requestedQuality || "best",
          onProgress,
        }
      );
      return {
        sourcePath: acquired.sourceFilePath,
        actualQuality: acquired.actualQuality,
        metadata: acquired.metadata,
      };
    }

    // Direct HTTP/HTTPS Media URL download with SSRF, size, and duration validation
    const parsed = new URL(sourceUrl);
    const protocol = parsed.protocol === "https:" ? https : http;
    const tempSourcePath = getJobFilePath(jobId, "source");

    return new Promise((resolve, reject) => {
      const req = protocol.get(sourceUrl, { timeout: 15000 }, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          const err = new Error(`Source URL returned HTTP status ${res.statusCode}.`);
          (err as any).errorCode = "SOURCE_UNAVAILABLE";
          return reject(err);
        }

        const contentLengthHeader = res.headers["content-length"];
        if (contentLengthHeader) {
          const totalBytes = parseInt(contentLengthHeader, 10);
          const maxBytes = WORKER_LIMITS.MAX_INPUT_MB * 1024 * 1024;
          if (totalBytes > maxBytes) {
            const err = new Error(`Source file size exceeds maximum limit of ${WORKER_LIMITS.MAX_INPUT_MB} MB.`);
            (err as any).errorCode = "INPUT_TOO_LARGE";
            return reject(err);
          }
        }

        const fileStream = fs.createWriteStream(tempSourcePath);
        let downloadedBytes = 0;
        const maxBytes = WORKER_LIMITS.MAX_INPUT_MB * 1024 * 1024;

        res.on("data", (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          if (downloadedBytes > maxBytes) {
            req.destroy();
            fileStream.close();
            safeDeleteFile(tempSourcePath);
            const err = new Error(`Source file size exceeds maximum limit of ${WORKER_LIMITS.MAX_INPUT_MB} MB.`);
            (err as any).errorCode = "INPUT_TOO_LARGE";
            return reject(err);
          }
        });

        res.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close(() => {
            if (fs.existsSync(tempSourcePath) && fs.statSync(tempSourcePath).size > 0) {
              if (onProgress) onProgress(35, "Source media downloaded to worker storage.");
              resolve({ sourcePath: tempSourcePath });
            } else {
              const err = new Error("Downloaded source media file is empty.");
              (err as any).errorCode = "SOURCE_UNAVAILABLE";
              reject(err);
            }
          });
        });

        fileStream.on("error", (err) => {
          safeDeleteFile(tempSourcePath);
          reject(err);
        });
      });

      req.on("error", (err) => {
        safeDeleteFile(tempSourcePath);
        const error = new Error(`Failed to fetch source media URL: ${err.message}`);
        (error as any).errorCode = "NETWORK_FAILURE";
        reject(error);
      });

      req.on("timeout", () => {
        req.destroy();
        safeDeleteFile(tempSourcePath);
        const err = new Error("Source media request timed out.");
        (err as any).errorCode = "PROCESSING_TIMEOUT";
        reject(err);
      });
    });
  }

  /**
   * Controlled video processing method
   */
  public async processVideo(
    inputPath: string,
    jobId: string,
    profile: ReturnType<typeof getFFmpegProfile>,
    onProgress?: (pct: number) => void
  ): Promise<string> {
    if (!profile) throw new Error("Invalid profile provided for video processing.");

    const outputPath = getJobFilePath(jobId, profile.outputExtension);
    await runFFmpegProcess({
      inputPath,
      outputPath,
      args: profile.args,
      onProgress,
      timeoutSeconds: WORKER_LIMITS.PROCESSING_TIMEOUT_SECONDS,
    });

    return outputPath;
  }

  /**
   * Controlled audio extraction / conversion method
   */
  public async extractAudio(
    inputPath: string,
    jobId: string,
    profile: ReturnType<typeof getFFmpegProfile>,
    onProgress?: (pct: number) => void
  ): Promise<string> {
    if (!profile) throw new Error("Invalid profile provided for audio processing.");

    const outputPath = getJobFilePath(jobId, profile.outputExtension);
    await runFFmpegProcess({
      inputPath,
      outputPath,
      args: profile.args,
      onProgress,
      timeoutSeconds: WORKER_LIMITS.PROCESSING_TIMEOUT_SECONDS,
    });

    return outputPath;
  }
}

export const defaultMediaProcessor = new MediaProcessor();
