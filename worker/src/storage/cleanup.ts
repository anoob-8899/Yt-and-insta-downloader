import { cleanupExpiredTokensAndFiles } from "./temporaryStorage";

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Initializes automatic background cleanup task for temporary worker files.
 * Runs every 60 seconds.
 */
export function startCleanupTask(intervalMs: number = 60000) {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    try {
      cleanupExpiredTokensAndFiles();
    } catch (err) {
      console.error("[CLEANUP] Background cleanup failed:", err);
    }
  }, intervalMs);

  console.log(`[CLEANUP] Background cleanup task active (interval: ${intervalMs / 1000}s).`);
}

/**
 * Stops background cleanup task (used in graceful shutdown and testing).
 */
export function stopCleanupTask() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
