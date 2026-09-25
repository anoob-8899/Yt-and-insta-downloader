import { validateMediaUrl, parseYouTubeUrl } from "./validation";
import { AnalyzeResponse, ErrorCode, SourcePlatform } from "./types";
import { getAvailableFormatsForSource } from "./formats";

/**
 * Reusable server-side YouTube ID extractor.
 * Delegates to parseYouTubeUrl to ensure consistent single-parser behavior.
 */
export function extractYouTubeId(urlStr: string): string | null {
  const result = parseYouTubeUrl(urlStr);
  return result.videoId;
}

/**
 * Parses ISO 8601 duration format (e.g. PT3M20S, PT54S, PT1H2M14S) into total seconds.
 */
export function parseISO8601Duration(isoDuration: string): number {
  if (!isoDuration || typeof isoDuration !== "string") return 0;
  const regex = /P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/;
  const matches = isoDuration.match(regex);
  if (!matches) return 0;
  const days = parseInt(matches[1] || "0", 10);
  const hours = parseInt(matches[2] || "0", 10);
  const minutes = parseInt(matches[3] || "0", 10);
  const seconds = parseInt(matches[4] || "0", 10);
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

interface YouTubeMetadataResult {
  success: boolean;
  title?: string;
  creator?: string;
  duration?: number;
  thumbnailUrl?: string;
  error?: string;
  errorCode?: ErrorCode;
}

/**
 * Retrieves YouTube video metadata using YouTube Data API v3 if YOUTUBE_API_KEY is configured,
 * or official YouTube oEmbed API as secondary metadata fallback.
 */
async function fetchYouTubeMetadata(videoId: string): Promise<YouTubeMetadataResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (apiKey && apiKey.trim().length > 0) {
    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${videoId}&key=${apiKey.trim()}`;
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) });

      if (!res.ok) {
        if (res.status === 403) {
          const errorBody = await res.json().catch(() => ({}));
          const isQuota = errorBody?.error?.errors?.some(
            (e: { reason?: string }) =>
              e.reason === "quotaExceeded" || e.reason === "dailyLimitExceeded"
          );
          if (isQuota) {
            return {
              success: false,
              error: "Metadata service rate limit exceeded. Please try again later.",
              errorCode: "RATE_LIMIT_EXCEEDED",
            };
          }
        }
        if (res.status === 404) {
          return {
            success: false,
            error: "This media is currently unavailable.",
            errorCode: "UNAVAILABLE_MEDIA",
          };
        }
        return {
          success: false,
          error: "This media is currently unavailable.",
          errorCode: "UNAVAILABLE_MEDIA",
        };
      }

      const data = await res.json();
      if (!data.items || data.items.length === 0) {
        return {
          success: false,
          error: "This media is currently unavailable.",
          errorCode: "UNAVAILABLE_MEDIA",
        };
      }

      const item = data.items[0];
      const snippet = item.snippet || {};
      const contentDetails = item.contentDetails || {};

      const title = snippet.title;
      if (!title || typeof title !== "string" || title.trim() === "" || title.trim() === videoId) {
        return {
          success: false,
          error: "This media is currently unavailable.",
          errorCode: "UNAVAILABLE_MEDIA",
        };
      }

      const creator = snippet.channelTitle?.trim() || undefined;
      const parsedSecs = parseISO8601Duration(contentDetails.duration);
      const duration = parsedSecs > 0 ? parsedSecs : undefined;

      const thumbnails = snippet.thumbnails || {};
      const thumbnailUrl =
        thumbnails.maxres?.url ||
        thumbnails.standard?.url ||
        thumbnails.high?.url ||
        thumbnails.medium?.url ||
        thumbnails.default?.url;

      return {
        success: true,
        title: title.trim(),
        creator,
        duration,
        thumbnailUrl,
      };
    } catch {
      // Do not expose API key or raw errors
      return {
        success: false,
        error: "Unable to retrieve YouTube metadata.",
        errorCode: "UNAVAILABLE_MEDIA",
      };
    }
  }

  // Fallback metadata fetcher via official YouTube oEmbed (when YOUTUBE_API_KEY is missing)
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(8000) });

    if (res.status === 404 || !res.ok) {
      return {
        success: false,
        error: "This media is currently unavailable.",
        errorCode: "UNAVAILABLE_MEDIA",
      };
    }

    const data = await res.json();
    if (data && data.title && typeof data.title === "string" && data.title.trim() !== videoId) {
      return {
        success: true,
        title: data.title.trim(),
        creator: data.author_name?.trim() || undefined,
        duration: undefined, // oEmbed does not return duration; do NOT fake fallback duration!
        thumbnailUrl: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      };
    }
  } catch {
    // Ignore fetch failure
  }

  return {
    success: false,
    error: "This media is currently unavailable.",
    errorCode: "UNAVAILABLE_MEDIA",
  };
}

/**
 * Analyzes URL metadata using YouTube Data API / worker / oEmbed.
 */
export async function analyzeMedia(rawUrl: string): Promise<AnalyzeResponse> {
  const validation = validateMediaUrl(rawUrl);

  if (!validation.isValid || !validation.normalizedUrl || !validation.source) {
    return {
      success: false,
      error: validation.error || "Please enter a supported YouTube or Instagram URL.",
      errorCode: "INVALID_URL",
    };
  }

  const workerUrl = process.env.MEDIA_WORKER_URL;
  const isWorkerConfigured = Boolean(workerUrl && workerUrl.trim().length > 0);
  const source: SourcePlatform = validation.source;

  // If external media worker is configured, delegate analysis request to worker
  if (isWorkerConfigured) {
    try {
      const response = await fetch(`${workerUrl}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Mediaflow-Secret": process.env.MEDIA_WORKER_SECRET || "",
        },
        body: JSON.stringify({ url: validation.normalizedUrl }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        return {
          success: false,
          source,
          error: errData.message || "This media is currently unavailable.",
          errorCode: errData.code || "PROCESSING_FAILED",
          workerConfigured: true,
        };
      }

      const workerResult = await response.json();
      return {
        success: true,
        source: workerResult.source || source,
        videoId: workerResult.videoId,
        id: workerResult.id || workerResult.videoId,
        title: workerResult.title,
        creator: workerResult.creator,
        duration: workerResult.duration,
        thumbnailUrl: workerResult.thumbnailUrl,
        previewUrl: workerResult.previewUrl,
        status: "metadata",
        formats: workerResult.formats || getAvailableFormatsForSource(source),
        workerConfigured: true,
      };
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === "TimeoutError";
      return {
        success: false,
        source,
        error: isTimeout
          ? "Media analysis timed out. Please try again."
          : "Something went wrong. Please try again.",
        errorCode: isTimeout ? "PROCESSING_TIMEOUT" : "NETWORK_FAILURE",
        workerConfigured: true,
      };
    }
  }

  // Handle YouTube metadata analysis
  if (source === "youtube") {
    const ytResult = parseYouTubeUrl(validation.normalizedUrl);
    const videoId = ytResult.videoId;
    if (!videoId) {
      return {
        success: false,
        source,
        error: "Please enter a supported YouTube or Instagram URL.",
        errorCode: "INVALID_URL",
        workerConfigured: false,
      };
    }

    const ytMeta = await fetchYouTubeMetadata(videoId);
    if (!ytMeta.success || !ytMeta.title) {
      return {
        success: false,
        source,
        error: ytMeta.error || "This media is currently unavailable.",
        errorCode: ytMeta.errorCode || "UNAVAILABLE_MEDIA",
        workerConfigured: false,
      };
    }

    return {
      success: true,
      source,
      videoId,
      id: videoId,
      title: ytMeta.title,
      creator: ytMeta.creator,
      duration: ytMeta.duration,
      thumbnailUrl: ytMeta.thumbnailUrl,
      previewUrl: undefined,
      status: "metadata",
      formats: getAvailableFormatsForSource(source),
      workerConfigured: false,
    };
  }

  // Handle Instagram metadata analysis when worker is not configured
  return {
    success: false,
    source: "instagram",
    error: "This media is currently unavailable.",
    errorCode: "UNAVAILABLE_MEDIA",
    workerConfigured: false,
  };
}
