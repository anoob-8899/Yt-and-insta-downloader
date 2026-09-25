import { spawn, spawnSync } from "child_process";
import fs from "fs";
import { WORKER_LIMITS } from "../security/limits";

let cachedFFmpegPath: string | null = null;
let isFFmpegChecked = false;

/**
 * Detects FFmpeg binary on system PATH, environment variable, or bundled fallback.
 * Provides clear developer diagnostic at startup if FFmpeg is missing.
 */
export function detectFFmpegPath(): string | null {
  if (isFFmpegChecked && cachedFFmpegPath) return cachedFFmpegPath;

  // 1. Check process.env.FFMPEG_PATH override
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    cachedFFmpegPath = process.env.FFMPEG_PATH;
    isFFmpegChecked = true;
    return cachedFFmpegPath;
  }

  // 2. Check system PATH
  try {
    const res = spawnSync("ffmpeg", ["-version"]);
    if (res.status === 0) {
      cachedFFmpegPath = "ffmpeg";
      isFFmpegChecked = true;
      return cachedFFmpegPath;
    }
  } catch {
    // Not on system PATH
  }

  // 3. Fallback to ffmpeg-static package
  try {
    const ffmpegStatic = require("ffmpeg-static");
    if (ffmpegStatic && typeof ffmpegStatic === "string" && fs.existsSync(ffmpegStatic)) {
      cachedFFmpegPath = ffmpegStatic;
      isFFmpegChecked = true;
      return cachedFFmpegPath;
    }
  } catch {
    // ffmpeg-static not available
  }

  isFFmpegChecked = true;
  console.warn(
    "[FFMPEG DIAGNOSTIC] Warning: FFmpeg executable not found on PATH or via FFMPEG_PATH / ffmpeg-static. Media conversion jobs requiring encoding will fail until FFmpeg is installed."
  );
  return null;
}

/**
 * Parses timestamp string HH:MM:SS.mm into total seconds.
 */
function parseFFmpegTime(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(":");
  if (parts.length < 3) return 0;
  const hours = parseFloat(parts[0]) || 0;
  const minutes = parseFloat(parts[1]) || 0;
  const seconds = parseFloat(parts[2]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

export interface RunFFmpegOptions {
  inputPath: string;
  outputPath: string;
  args: string[];
  totalDurationSecs?: number;
  onProgress?: (percentage: number) => void;
  timeoutSeconds?: number;
}

/**
 * Spawns FFmpeg safely with fixed argument arrays.
 * Handles progress parsing, output verification, and process timeout.
 */
export async function runFFmpegProcess(options: RunFFmpegOptions): Promise<void> {
  const ffmpegBin = detectFFmpegPath();
  if (!ffmpegBin) {
    throw new Error("FFmpeg executable is not available on worker host.");
  }

  const timeoutMs = (options.timeoutSeconds || WORKER_LIMITS.PROCESSING_TIMEOUT_SECONDS) * 1000;
  let detectedDuration = options.totalDurationSecs || 0;

  return new Promise((resolve, reject) => {
    const fullArgs = ["-y", "-i", options.inputPath, ...options.args, options.outputPath];

    const child = spawn(ffmpegBin, fullArgs, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderrBuffer = "";
    let isSettled = false;

    const timeoutTimer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        try {
          child.kill("SIGKILL");
        } catch {
          // Process already terminated
        }
        reject(new Error("PROCESSING_TIMEOUT"));
      }
    }, timeoutMs);

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderrBuffer += text;

      // Extract duration if not provided
      if (detectedDuration === 0) {
        const durMatch = text.match(/Duration:\s*(\d{2}:\d{2}:\d{2}\.\d+)/);
        if (durMatch && durMatch[1]) {
          detectedDuration = parseFFmpegTime(durMatch[1]);
        }
      }

      // Extract progress time=00:00:15.50
      if (options.onProgress && detectedDuration > 0) {
        const timeMatch = text.match(/time=\s*(\d{2}:\d{2}:\d{2}\.\d+)/);
        if (timeMatch && timeMatch[1]) {
          const currentTime = parseFFmpegTime(timeMatch[1]);
          const pct = Math.min(99, Math.max(1, Math.round((currentTime / detectedDuration) * 100)));
          options.onProgress(pct);
        }
      }
    });

    child.on("error", (err) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timeoutTimer);
      reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
    });

    child.on("close", (code) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timeoutTimer);

      if (code === 0 && fs.existsSync(options.outputPath)) {
        const stats = fs.statSync(options.outputPath);
        if (stats.size > 0) {
          if (options.onProgress) options.onProgress(100);
          return resolve();
        }
      }

      const lastErrLine = stderrBuffer.split("\n").filter(Boolean).pop() || "FFmpeg process failed";
      reject(new Error(`FFmpeg encoding failed with exit code ${code}: ${lastErrLine}`));
    });
  });
}
