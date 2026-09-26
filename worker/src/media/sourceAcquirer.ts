import { spawn, spawnSync, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { WORKER_LIMITS } from "../security/limits";
import { parseYouTubeUrl, parseInstagramUrl } from "../../../lib/media/validation";
import { getJobFilePath } from "../storage/temporaryStorage";

export interface NormalizedSourceFormat {
  formatId: string;
  ext: string;
  container?: string;
  vcodec?: string;
  acodec?: string;
  width?: number;
  height?: number;
  fps?: number;
  tbr?: number;
  abr?: number;
  filesize?: number;
  qualityLabel?: string;
}

export interface SourceMetadata {
  sourceType: "youtube" | "instagram";
  id: string;
  title: string;
  creator?: string;
  duration?: number;
  thumbnailUrl?: string;
  availableFormats?: NormalizedSourceFormat[];
}

export interface AcquireSourceOptions {
  mediaType: "video" | "audio";
  requestedQuality: string;
  onProgress?: (progress: number, stepMessage: string) => void;
}

export interface AcquireSourceResult {
  metadata?: SourceMetadata;
  sourceFilePath: string;
  actualQuality: string;
  actualFormat: string;
  ext: string;
}

// Active child process registry per jobId to allow process termination on timeout/cancellation
const activeJobProcesses = new Map<string, ChildProcess>();

export function registerJobProcess(jobId: string, proc: ChildProcess): void {
  activeJobProcesses.set(jobId, proc);
}

export function unregisterJobProcess(jobId: string): void {
  activeJobProcesses.delete(jobId);
}

export function terminateJobProcess(jobId: string): void {
  const proc = activeJobProcesses.get(jobId);
  if (proc) {
    try {
      proc.kill("SIGKILL");
    } catch {
      // Ignore process termination errors
    }
    activeJobProcesses.delete(jobId);
  }
}

/**
 * Startup binary detection for yt-dlp.
 * Checks env override, PATH, and common Windows python scripts installation locations.
 */
export function detectYtDlpPath(): string | null {
  // 1. Check custom path override from environment
  if (WORKER_LIMITS.YT_DLP_PATH || process.env.YT_DLP_PATH) {
    const custom = WORKER_LIMITS.YT_DLP_PATH || process.env.YT_DLP_PATH || "";
    if (custom.trim().length > 0) {
      try {
        const check = spawnSync(custom.trim(), ["--version"], { windowsHide: true });
        if (check.status === 0) return custom.trim();
      } catch {
        // Ignore fallback
      }
    }
  }

  // 2. Check system PATH
  try {
    const check = spawnSync("yt-dlp", ["--version"], { windowsHide: true });
    if (check.status === 0) return "yt-dlp";
  } catch {
    // Ignore fallback
  }

  // 3. Fallback check for Windows Python environment installs
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    const userProfile = process.env.USERPROFILE || "";
    const appData = process.env.APPDATA || "";

    const candidates = [
      path.join(localAppData, "Programs", "Python", "Python313", "Scripts", "yt-dlp.exe"),
      path.join(localAppData, "Programs", "Python", "Python312", "Scripts", "yt-dlp.exe"),
      path.join(localAppData, "Programs", "Python", "Python311", "Scripts", "yt-dlp.exe"),
      path.join(localAppData, "Programs", "Python", "Python310", "Scripts", "yt-dlp.exe"),
      path.join(userProfile, "AppData", "Local", "Programs", "Python", "Python313", "Scripts", "yt-dlp.exe"),
      path.join(appData, "Python", "Python313", "Scripts", "yt-dlp.exe"),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        try {
          const check = spawnSync(cand, ["--version"], { windowsHide: true });
          if (check.status === 0) return cand;
        } catch {
          // Ignore candidate failure
        }
      }
    }
  }

  return null;
}

/**
 * Diagnostic helper to get yt-dlp version.
 */
export function getYtDlpVersion(): string | null {
  const binaryPath = detectYtDlpPath();
  if (!binaryPath) return null;
  try {
    const res = spawnSync(binaryPath, ["--version"], { encoding: "utf-8", timeout: 5000, windowsHide: true });
    if (res.status === 0 && res.stdout) {
      return res.stdout.trim();
    }
  } catch {
    // Ignore error
  }
  return null;
}

/**
 * Dynamic resolution matching for video quality.
 * Enforces NO-UPSCALING policy: requested -> exact match -> highest available below requested -> best compatible lower.
 */
export function selectVideoFormatAndQuality(
  availableFormats: NormalizedSourceFormat[] | undefined,
  requestedQuality: string
): { formatExpr: string; actualQuality: string } {
  if (!availableFormats || availableFormats.length === 0) {
    if (requestedQuality === "1080p") {
      return {
        formatExpr: "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
        actualQuality: "1080p",
      };
    }
    if (requestedQuality === "720p") {
      return {
        formatExpr: "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/bestvideo[height<=720]+bestaudio/best[height<=720]/best",
        actualQuality: "720p",
      };
    }
    if (requestedQuality === "480p") {
      return {
        formatExpr: "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/bestvideo[height<=480]+bestaudio/best[height<=480]/best",
        actualQuality: "480p",
      };
    }
    if (requestedQuality === "360p") {
      return {
        formatExpr: "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/bestvideo[height<=360]+bestaudio/best[height<=360]/best",
        actualQuality: "360p",
      };
    }
    return {
      formatExpr: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/bestvideo+bestaudio/best",
      actualQuality: "best",
    };
  }

  const videoHeights = availableFormats
    .map((f) => f.height)
    .filter((h): h is number => typeof h === "number" && h > 0);

  if (videoHeights.length === 0) {
    return {
      formatExpr: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/bestvideo+bestaudio/best",
      actualQuality: "best",
    };
  }

  const targetHeightMap: Record<string, number> = {
    "1080p": 1080,
    "720p": 720,
    "480p": 480,
    "360p": 360,
  };

  const targetHeight = targetHeightMap[requestedQuality];

  if (!targetHeight || requestedQuality === "best") {
    const maxAvailable = Math.max(...videoHeights);
    const actualQuality = `${maxAvailable}p`;
    return {
      formatExpr: `bestvideo[height<=${maxAvailable}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${maxAvailable}][ext=mp4]/bestvideo[height<=${maxAvailable}]+bestaudio/best`,
      actualQuality,
    };
  }

  // 1. Exact match
  const exactMatch = videoHeights.find((h) => h === targetHeight);
  if (exactMatch) {
    return {
      formatExpr: `bestvideo[height<=${targetHeight}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${targetHeight}][ext=mp4]/bestvideo[height<=${targetHeight}]+bestaudio/best`,
      actualQuality: `${targetHeight}p`,
    };
  }

  // 2. Highest available quality below requested
  const lowerHeights = videoHeights.filter((h) => h < targetHeight);
  if (lowerHeights.length > 0) {
    const highestBelow = Math.max(...lowerHeights);
    return {
      formatExpr: `bestvideo[height<=${highestBelow}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${highestBelow}][ext=mp4]/bestvideo[height<=${highestBelow}]+bestaudio/best`,
      actualQuality: `${highestBelow}p`,
    };
  }

  // 3. Fallback to lowest available quality without upscaling
  const minAvailable = Math.min(...videoHeights);
  return {
    formatExpr: `bestvideo[height<=${minAvailable}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${minAvailable}][ext=mp4]/bestvideo[height<=${minAvailable}]+bestaudio/best`,
    actualQuality: `${minAvailable}p`,
  };
}

/**
 * Controlled SourceAcquirer abstraction isolating source media extraction from FFmpeg and job registry.
 */
export class SourceAcquirer {
  private cachedBinaryPath: string | null = null;

  public getBinaryPath(): string | null {
    if (!this.cachedBinaryPath) {
      this.cachedBinaryPath = detectYtDlpPath();
    }
    return this.cachedBinaryPath;
  }

  /**
   * Safe metadata inspection via yt-dlp --dump-json
   */
  public async analyzeSource(url: string): Promise<SourceMetadata> {
    const ytResult = parseYouTubeUrl(url);
    const igResult = parseInstagramUrl(url);

    if (ytResult.platform !== "youtube" && igResult.platform !== "instagram") {
      const err = new Error("Unsupported media platform URL.");
      (err as any).errorCode = "UNSUPPORTED_SOURCE";
      throw err;
    }

    const binary = this.getBinaryPath();
    if (!binary) {
      const err = new Error("Source acquirer backend (yt-dlp) is not configured on worker.");
      (err as any).errorCode = "WORKER_UNCONFIGURED";
      throw err;
    }

    // Fixed internal flags array — NEVER pass concatenated user strings or allow shell evaluation
    const args = [
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      "--skip-download",
      "--",
      url,
    ];

    return new Promise((resolve, reject) => {
      const timeoutMs = WORKER_LIMITS.SOURCE_ACQUISITION_TIMEOUT_SECONDS * 1000;
      const proc = spawn(binary, args, { windowsHide: true });

      let stdout = "";
      let stderr = "";

      const timeoutTimer = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
        const err = new Error("Source metadata analysis timed out.");
        (err as any).errorCode = "SOURCE_TIMEOUT";
        reject(err);
      }, timeoutMs);

      proc.stdout.on("data", (data) => {
        stdout += data.toString("utf-8");
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString("utf-8");
      });

      proc.on("error", (err) => {
        clearTimeout(timeoutTimer);
        const error = new Error(`Failed to execute source acquirer process: ${err.message}`);
        (error as any).errorCode = "EXTRACTOR_ERROR";
        reject(error);
      });

      proc.on("close", (code) => {
        clearTimeout(timeoutTimer);
        if (code !== 0) {
          const lowerStderr = stderr.toLowerCase();
          let errorCode = "SOURCE_UNAVAILABLE";
          let userMsg = "This media source is currently unavailable.";

          if (
            lowerStderr.includes("private video") ||
            lowerStderr.includes("login") ||
            lowerStderr.includes("authenticated") ||
            lowerStderr.includes("requires login") ||
            lowerStderr.includes("members-only") ||
            lowerStderr.includes("sign in")
          ) {
            errorCode = "AUTHENTICATION_REQUIRED";
            userMsg = "This source requires authentication which is not supported.";
          } else if (
            lowerStderr.includes("429") ||
            lowerStderr.includes("too many requests") ||
            lowerStderr.includes("rate-limited")
          ) {
            errorCode = "RATE_LIMITED";
            userMsg = "Source platform rate limit exceeded.";
          } else if (
            lowerStderr.includes("not found") ||
            lowerStderr.includes("404") ||
            lowerStderr.includes("does not exist")
          ) {
            errorCode = "MEDIA_NOT_FOUND";
            userMsg = "Requested media was not found on the platform.";
          }

          const err = new Error(userMsg);
          (err as any).errorCode = errorCode;
          return reject(err);
        }

        try {
          const json = JSON.parse(stdout);
          const formats: NormalizedSourceFormat[] = [];
          if (Array.isArray(json.formats)) {
            for (const f of json.formats) {
              const height = typeof f.height === "number" ? f.height : undefined;
              const qualityLabel = height ? `${height}p` : undefined;
              formats.push({
                formatId: String(f.format_id || ""),
                ext: String(f.ext || ""),
                container: f.container ? String(f.container) : undefined,
                vcodec: f.vcodec ? String(f.vcodec) : undefined,
                acodec: f.acodec ? String(f.acodec) : undefined,
                width: typeof f.width === "number" ? f.width : undefined,
                height,
                fps: typeof f.fps === "number" ? f.fps : undefined,
                tbr: typeof f.tbr === "number" ? f.tbr : undefined,
                abr: typeof f.abr === "number" ? f.abr : undefined,
                filesize: typeof f.filesize === "number" ? f.filesize : undefined,
                qualityLabel,
              });
            }
          }

          const metadata: SourceMetadata = {
            sourceType: ytResult.platform === "youtube" ? "youtube" : "instagram",
            id: String(json.id || ytResult.videoId || igResult.mediaId || ""),
            title: String(json.title || json.fulltitle || "Untitled Media"),
            creator: json.uploader || json.channel || json.artist || json.creator || undefined,
            duration: typeof json.duration === "number" ? json.duration : undefined,
            thumbnailUrl:
              json.thumbnail ||
              (Array.isArray(json.thumbnails) && json.thumbnails.length > 0
                ? json.thumbnails[json.thumbnails.length - 1].url
                : undefined),
            availableFormats: formats,
          };

          resolve(metadata);
        } catch {
          const err = new Error("Failed to parse source metadata.");
          (err as any).errorCode = "EXTRACTOR_ERROR";
          reject(err);
        }
      });
    });
  }

  public getAvailableFormats(metadata: SourceMetadata): NormalizedSourceFormat[] {
    return metadata.availableFormats || [];
  }

  /**
   * Secure source acquisition into worker-controlled temporary storage.
   */
  public async acquireSource(
    url: string,
    jobId: string,
    options: AcquireSourceOptions
  ): Promise<AcquireSourceResult> {
    const ytResult = parseYouTubeUrl(url);
    const igResult = parseInstagramUrl(url);

    if (ytResult.platform !== "youtube" && igResult.platform !== "instagram") {
      const err = new Error("Unsupported media platform URL.");
      (err as any).errorCode = "UNSUPPORTED_SOURCE";
      throw err;
    }

    const binary = this.getBinaryPath();
    if (!binary) {
      const err = new Error("Source acquirer backend (yt-dlp) is not configured on worker.");
      (err as any).errorCode = "WORKER_UNCONFIGURED";
      throw err;
    }

    if (options.onProgress) {
      options.onProgress(15, "Inspecting available source media formats...");
    }

    let metadata: SourceMetadata | undefined;
    try {
      metadata = await this.analyzeSource(url);
    } catch (metaErr) {
      const code = (metaErr as any)?.errorCode;
      if (code === "AUTHENTICATION_REQUIRED" || code === "RATE_LIMITED" || code === "MEDIA_NOT_FOUND") {
        throw metaErr;
      }
    }

    let formatExpr = "";
    let actualQuality = options.requestedQuality;

    if (options.mediaType === "audio") {
      formatExpr = "bestaudio[ext=m4a]/bestaudio/best";
      actualQuality = options.requestedQuality;
    } else {
      const sel = selectVideoFormatAndQuality(metadata?.availableFormats, options.requestedQuality);
      formatExpr = sel.formatExpr;
      actualQuality = sel.actualQuality;
    }

    // Output template generated internally: worker/temp/<jobId>/source_<jobId>.%(ext)s
    const tempDir = path.dirname(getJobFilePath(jobId, "tmp"));
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const outputTemplate = path.join(tempDir, `source_${jobId}.%(ext)s`);

    // Fixed internal flags — strictly validated flags, no client-supplied args/cookies/proxies
    const args = [
      "--no-playlist",
      "--no-warnings",
      "--max-filesize", `${WORKER_LIMITS.MAX_INPUT_MB}M`,
      "-f", formatExpr,
      "-o", outputTemplate,
      "--",
      url,
    ];

    if (options.onProgress) {
      options.onProgress(25, "Acquiring authorized public media stream...");
    }

    return new Promise((resolve, reject) => {
      const timeoutMs = WORKER_LIMITS.SOURCE_ACQUISITION_TIMEOUT_SECONDS * 1000;
      const proc = spawn(binary, args, { windowsHide: true });
      registerJobProcess(jobId, proc);

      let stderr = "";

      const timeoutTimer = setTimeout(() => {
        terminateJobProcess(jobId);
        this.cleanupJobSourceFiles(tempDir, jobId);
        const err = new Error("Source acquisition timed out.");
        (err as any).errorCode = "SOURCE_TIMEOUT";
        reject(err);
      }, timeoutMs);

      proc.stderr.on("data", (data) => {
        stderr += data.toString("utf-8");
      });

      proc.on("error", (err) => {
        clearTimeout(timeoutTimer);
        unregisterJobProcess(jobId);
        this.cleanupJobSourceFiles(tempDir, jobId);
        const error = new Error(`Failed to execute source acquisition: ${err.message}`);
        (error as any).errorCode = "EXTRACTOR_ERROR";
        reject(error);
      });

      proc.on("close", (code) => {
        clearTimeout(timeoutTimer);
        unregisterJobProcess(jobId);

        if (code !== 0) {
          this.cleanupJobSourceFiles(tempDir, jobId);
          const lowerStderr = stderr.toLowerCase();
          let errorCode = "SOURCE_UNAVAILABLE";
          let userMsg = "This media source is currently unavailable.";

          if (
            lowerStderr.includes("private video") ||
            lowerStderr.includes("login") ||
            lowerStderr.includes("authenticated") ||
            lowerStderr.includes("requires login") ||
            lowerStderr.includes("members-only") ||
            lowerStderr.includes("sign in")
          ) {
            errorCode = "AUTHENTICATION_REQUIRED";
            userMsg = "This source requires authentication which is not supported.";
          } else if (
            lowerStderr.includes("file is larger than max-filesize") ||
            lowerStderr.includes("file too large")
          ) {
            errorCode = "SOURCE_TOO_LARGE";
            userMsg = `Source file size exceeds limit of ${WORKER_LIMITS.MAX_INPUT_MB} MB.`;
          } else if (
            lowerStderr.includes("429") ||
            lowerStderr.includes("too many requests")
          ) {
            errorCode = "RATE_LIMITED";
            userMsg = "Source platform rate limit exceeded.";
          } else if (
            lowerStderr.includes("not found") ||
            lowerStderr.includes("404")
          ) {
            errorCode = "MEDIA_NOT_FOUND";
            userMsg = "Requested media not found.";
          }

          const err = new Error(userMsg);
          (err as any).errorCode = errorCode;
          return reject(err);
        }

        const foundFile = this.findAcquiredFile(tempDir, jobId);
        if (!foundFile || !fs.existsSync(foundFile)) {
          const err = new Error("Source acquisition failed to output a valid media file.");
          (err as any).errorCode = "SOURCE_UNAVAILABLE";
          return reject(err);
        }

        const stat = fs.statSync(foundFile);
        const maxBytes = WORKER_LIMITS.MAX_INPUT_MB * 1024 * 1024;
        if (stat.size > maxBytes) {
          try { fs.unlinkSync(foundFile); } catch {}
          const err = new Error(`Acquired source media exceeds size limit of ${WORKER_LIMITS.MAX_INPUT_MB} MB.`);
          (err as any).errorCode = "SOURCE_TOO_LARGE";
          return reject(err);
        }

        if (stat.size === 0) {
          try { fs.unlinkSync(foundFile); } catch {}
          const err = new Error("Acquired source media file is empty.");
          (err as any).errorCode = "SOURCE_UNAVAILABLE";
          return reject(err);
        }

        const ext = path.extname(foundFile).replace(".", "") || "mp4";

        if (options.onProgress) {
          options.onProgress(35, "Media stream acquired successfully.");
        }

        resolve({
          metadata,
          sourceFilePath: foundFile,
          actualQuality,
          actualFormat: options.mediaType === "audio" ? options.requestedQuality : actualQuality,
          ext,
        });
      });
    });
  }

  private findAcquiredFile(dir: string, jobId: string): string | null {
    if (!fs.existsSync(dir)) return null;
    const prefix = `source_${jobId}`;
    try {
      const files = fs.readdirSync(dir);
      const match = files.find(
        (f) => f.startsWith(prefix) && !f.endsWith(".part") && !f.endsWith(".ytdl")
      );
      if (match) {
        return path.join(dir, match);
      }
    } catch {}
    return null;
  }

  private cleanupJobSourceFiles(dir: string, jobId: string): void {
    if (!fs.existsSync(dir)) return;
    const prefix = `source_${jobId}`;
    try {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.startsWith(prefix)) {
          try {
            fs.unlinkSync(path.join(dir, f));
          } catch {}
        }
      }
    } catch {}
  }
}

export const defaultSourceAcquirer = new SourceAcquirer();
