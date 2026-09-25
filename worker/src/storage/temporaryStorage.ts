import fs from "fs";
import path from "path";
import crypto from "crypto";
import { WORKER_LIMITS } from "../security/limits";

export interface DownloadTokenRecord {
  token: string;
  jobId: string;
  filePath: string;
  filename: string;
  mimeType: string;
  expiresAt: number;
}

const TEMP_DIR = path.resolve(process.cwd(), "worker", "temp");

// Ensure temporary storage directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// In-memory download token registry
const downloadTokens = new Map<string, DownloadTokenRecord>();

export function getTempDirectory(): string {
  return TEMP_DIR;
}

/**
 * Generates a secure, deterministic job-specific filesystem path.
 * Raw user input is NEVER used as a file path component.
 */
export function getJobFilePath(jobId: string, extension: string): string {
  const safeJobId = jobId.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeExt = extension.replace(/[^a-zA-Z0-9]/g, "");
  return path.join(TEMP_DIR, `job_${safeJobId}_${Date.now()}.${safeExt}`);
}

/**
 * Creates a secure temporary download token reference for a processed media file.
 */
export function createDownloadToken(
  jobId: string,
  filePath: string,
  filename: string,
  mimeType: string
): DownloadTokenRecord {
  const token = crypto.randomBytes(32).toString("hex");
  const ttlMs = WORKER_LIMITS.TEMP_FILE_TTL_SECONDS * 1000;
  const expiresAt = Date.now() + ttlMs;

  const record: DownloadTokenRecord = {
    token,
    jobId,
    filePath,
    filename,
    mimeType,
    expiresAt,
  };

  downloadTokens.set(token, record);
  return record;
}

/**
 * Validates and retrieves download token metadata.
 * Returns null if token does not exist or has expired.
 */
export function getDownloadToken(token: string): DownloadTokenRecord | null {
  if (!token || typeof token !== "string") return null;

  const record = downloadTokens.get(token);
  if (!record) return null;

  if (Date.now() > record.expiresAt) {
    downloadTokens.delete(token);
    safeDeleteFile(record.filePath);
    return null;
  }

  if (!fs.existsSync(record.filePath)) {
    downloadTokens.delete(token);
    return null;
  }

  return record;
}

/**
 * Safely deletes a file from disk if it exists.
 */
export function safeDeleteFile(filePath: string): boolean {
  try {
    if (filePath && fs.existsSync(filePath)) {
      // Security check: Ensure file resides within TEMP_DIR to prevent arbitrary deletion
      const resolvedPath = path.resolve(filePath);
      if (resolvedPath.startsWith(TEMP_DIR)) {
        fs.unlinkSync(resolvedPath);
        return true;
      }
    }
  } catch (err) {
    console.error(`[STORAGE] Error deleting temporary file ${filePath}:`, err);
  }
  return false;
}

/**
 * Cleans up expired tokens and orphaned files.
 */
export function cleanupExpiredTokensAndFiles() {
  const now = Date.now();

  // Clean expired tokens
  downloadTokens.forEach((record, token) => {
    if (now > record.expiresAt) {
      downloadTokens.delete(token);
      safeDeleteFile(record.filePath);
    }
  });

  // Clean abandoned temporary files in TEMP_DIR
  try {
    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
      const fullPath = path.join(TEMP_DIR, file);
      try {
        const stats = fs.statSync(fullPath);
        const ageSeconds = (now - stats.mtimeMs) / 1000;
        if (ageSeconds > WORKER_LIMITS.TEMP_FILE_TTL_SECONDS) {
          safeDeleteFile(fullPath);
        }
      } catch {
        // Ignore stat errors
      }
    }
  } catch {
    // Ignore read directory errors
  }
}
