import express, { Request, Response } from "express";
import fs from "fs";
import { validateWorkerSecret } from "./security/auth";
import { handleCreateWorkerJob } from "./jobs/createJob";
import { handleGetWorkerJob } from "./jobs/getJob";
import { getDownloadToken } from "./storage/temporaryStorage";
import { startCleanupTask } from "./storage/cleanup";
import { detectFFmpegPath } from "./media/ffmpeg";
import { analyzeMedia } from "../../lib/media/analyzer";

const app = express();
app.use(express.json());

// Diagnostic check at startup
const ffmpegPath = detectFFmpegPath();
if (ffmpegPath) {
  console.log(`[WORKER STARTUP] FFmpeg detected: ${ffmpegPath}`);
} else {
  console.warn(`[WORKER STARTUP] WARNING: FFmpeg is missing. Media encoding jobs will fail.`);
}

// Start periodic cleanup task
startCleanupTask(60000);

// Unprotected Health Check Endpoint
const handleHealth = (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    worker: "mediaflow-worker",
    ffmpegAvailable: Boolean(ffmpegPath),
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

const PORT = parseInt(process.env.WORKER_PORT || "3001", 10);
const HOST = process.env.WORKER_HOST || "127.0.0.1";

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, HOST, () => {
    console.log(`[WORKER] MediaFlow Worker Service running at http://${HOST}:${PORT}`);
  });
}

export default app;
