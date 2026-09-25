export const WORKER_LIMITS = {
  // Maximum allowed input media file size in megabytes (default: 500 MB)
  MAX_INPUT_MB: parseInt(process.env.MAX_INPUT_MB || "500", 10),
  // Maximum allowed output media file size in megabytes (default: 500 MB)
  MAX_OUTPUT_MB: parseInt(process.env.MAX_OUTPUT_MB || "500", 10),
  // FFmpeg processing timeout in seconds (default: 300 seconds / 5 minutes)
  PROCESSING_TIMEOUT_SECONDS: parseInt(process.env.PROCESSING_TIMEOUT_SECONDS || "300", 10),
  // Temporary file time-to-live in seconds before cleanup (default: 3600 seconds / 1 hour)
  TEMP_FILE_TTL_SECONDS: parseInt(process.env.TEMP_FILE_TTL_SECONDS || "3600", 10),
};
