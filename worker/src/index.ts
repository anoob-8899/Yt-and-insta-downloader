import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { validateWorkerSecret } from "./security/auth";
import { handleCreateWorkerJob } from "./jobs/createJob";
import { handleGetWorkerJob } from "./jobs/getJob";
import { getDownloadToken, getTempDirectory } from "./storage/temporaryStorage";
import { startCleanupTask } from "./storage/cleanup";
import { detectFFmpegPath } from "./media/ffmpeg";
import { detectYtDlpPath, getYtDlpVersion } from "./media/sourceAcquirer";
import { analyzeMedia } from "../../lib/media/analyzer";
import { WORKER_LIMITS } from "./security/limits";

const app = express();
app.use(express.json());

// Startup Validation Function
function validateStartup(): { ffmpegAvailable: boolean; ytDlpAvailable: boolean; ytDlpVersion: string | null } {
  console.log("[WORKER STARTUP] Initializing production startup validation...");

  // 1. Secret Configuration
  const secret = process.env.MEDIA_WORKER_SECRET;
  if (!secret || !secret.trim()) {
    if (process.env.NODE_ENV === "production") {
      console.error("[WORKER STARTUP FATAL] MEDIA_WORKER_SECRET environment variable is unconfigured or empty in production environment. Failing startup.");
      process.exit(1);
    } else {
      console.warn("[WORKER STARTUP WARNING] MEDIA_WORKER_SECRET environment variable is unconfigured during startup. Calls will be rejected until configured.");
    }
  } else {
    console.log("[WORKER STARTUP] Worker secret verification configured.");
  }

  // 2. FFmpeg Detection
  const ffmpegPath = detectFFmpegPath();
  if (ffmpegPath) {
    console.log(`[WORKER STARTUP] FFmpeg detected successfully.`);
  } else {
    console.warn("[WORKER STARTUP WARNING] FFmpeg executable not found. Media encoding will fail.");
    if (process.env.NODE_ENV === "production") {
      console.error("[WORKER STARTUP FATAL] FFmpeg is required for production worker. Failing startup.");
      process.exit(1);
    }
  }

  // 3. yt-dlp Detection
  const ytDlpPath = detectYtDlpPath();
  const ytDlpVer = getYtDlpVersion();
  if (ytDlpPath) {
    console.log(`[WORKER STARTUP] yt-dlp detected successfully${ytDlpVer ? ` (v${ytDlpVer})` : ""}.`);
  } else {
    console.warn("[WORKER STARTUP WARNING] yt-dlp executable not found. Source acquisition will fail.");
    if (process.env.NODE_ENV === "production") {
      console.error("[WORKER STARTUP FATAL] yt-dlp is required for production worker. Failing startup.");
      process.exit(1);
    }
  }

  // 4. Temporary Directory Writable Check
  const tempDir = getTempDirectory();
  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const testFilePath = path.join(tempDir, `.startup_write_test_${Date.now()}`);
    fs.writeFileSync(testFilePath, "test");
    fs.unlinkSync(testFilePath);
    console.log("[WORKER STARTUP] Temporary directory storage validated and writable.");
  } catch (err: any) {
    console.error(`[WORKER STARTUP FATAL] Temporary directory storage write check failed: ${err.message}`);
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }

  // 5. Resource Limits Confirmation
  console.log(`[WORKER STARTUP] Resource limits: MAX_INPUT=${WORKER_LIMITS.MAX_INPUT_MB}MB, MAX_OUTPUT=${WORKER_LIMITS.MAX_OUTPUT_MB}MB, TIMEOUT=${WORKER_LIMITS.SOURCE_ACQUISITION_TIMEOUT_SECONDS}s, TTL=${WORKER_LIMITS.TEMP_FILE_TTL_SECONDS}s.`);

  return {
    ffmpegAvailable: Boolean(ffmpegPath),
    ytDlpAvailable: Boolean(ytDlpPath),
    ytDlpVersion: ytDlpVer,
  };
}

const startupStatus = validateStartup();

// Start periodic cleanup task
startCleanupTask(60000);

// Unprotected Safe Operational Health Check Endpoint
const handleHealth = (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    workerVersion: "1.0.0",
    ffmpegAvailable: startupStatus.ffmpegAvailable,
    ytDlpAvailable: startupStatus.ytDlpAvailable,
    ytDlpVersion: startupStatus.ytDlpVersion || undefined,
    timestamp: new Date().toISOString(),
  });
};
app.get("/health", handleHealth);
app.get("/api/v1/health", handleHealth);

// Protect all remaining worker endpoints with shared secret validation
app.use(validateWorkerSecret);

// 1. Analyze Endpoint (Worker-delegated analysis)
const handleAnalyze = async (req: Request, res: Response) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ code: "INVALID_URL", message: "Source URL required." });
    }
    const result = await analyzeMedia(url);
    if (!result.success) {
      return res.status(400).json({ code: result.errorCode || "UNAVAILABLE_MEDIA", message: result.error });
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ code: "PROCESSING_FAILED", message: err.message || "Analysis failed." });
  }
};
app.post("/analyze", handleAnalyze);
app.post("/api/v1/analyze", handleAnalyze);

// 2. Create Job Endpoint
const handleJobsPost = (req: Request, res: Response) => {
  const result = handleCreateWorkerJob(req.body);
  if (!result.success || !result.job) {
    return res.status(result.statusCode || 400).json({
      error: result.error,
      code: result.errorCode,
    });
  }
  return res.status(201).json(result.job);
};
app.post("/jobs", handleJobsPost);
app.post("/api/v1/jobs", handleJobsPost);

// 3. Get Job Status Endpoint
const handleJobsGet = (req: Request, res: Response) => {
  const jobId = req.params.id;
  if (!jobId || typeof jobId !== "string") {
    return res.status(400).json({
      error: "Invalid or missing job ID parameter.",
      code: "INVALID_REQUEST",
    });
  }
  const result = handleGetWorkerJob(jobId);
  if (!result.job) {
    return res.status(404).json({
      error: result.error || "Job not found.",
      code: "PROCESSING_FAILED",
    });
  }
  return res.json(result.job);
};
app.get("/jobs/:id", handleJobsGet);
app.get("/api/v1/jobs/:id", handleJobsGet);

// 4. Download File Endpoint (Streams temporary file to server proxy)
const handleDownloadGet = (req: Request, res: Response) => {
  const token = req.params.token;
  if (!token || typeof token !== "string") {
    return res.status(400).json({
      error: "Invalid or missing download token parameter.",
      code: "INVALID_REQUEST",
    });
  }
  const tokenRecord = getDownloadToken(token);

  if (!tokenRecord) {
    return res.status(410).json({
      error: "Download link has expired or is invalid.",
      code: "JOB_EXPIRED",
    });
  }

  if (!fs.existsSync(tokenRecord.filePath)) {
    return res.status(404).json({
      error: "Temporary media file is no longer available.",
      code: "STORAGE_FAILED",
    });
  }

  const stat = fs.statSync(tokenRecord.filePath);

  res.setHeader("Content-Type", tokenRecord.mimeType);
  res.setHeader("Content-Length", stat.size.toString());
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(tokenRecord.filename)}"`
  );

  const readStream = fs.createReadStream(tokenRecord.filePath);
  readStream.pipe(res);
};
app.get("/download/:token", handleDownloadGet);
app.get("/api/v1/download/:token", handleDownloadGet);

const PORT = parseInt(process.env.PORT || process.env.WORKER_PORT || "3001", 10);
const HOST = process.env.HOST || process.env.WORKER_HOST || "0.0.0.0";

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, HOST, () => {
    console.log(`[WORKER] MediaFlow Worker Service running at http://${HOST}:${PORT}`);
  });
}

export default app;
