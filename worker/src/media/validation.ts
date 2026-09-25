import { URL } from "url";

const BLOCKED_IP_REGEX = /^(?:127\.|10\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|0\.|fc00:|fe80:|::1)/i;

export interface ValidatedJobInput {
  isValid: boolean;
  url?: string;
  mediaType?: "video" | "audio";
  format?: "mp4" | "mp3" | "m4a";
  quality?: string;
  error?: string;
  errorCode?: string;
}

export function validateWorkerJobInput(body: any): ValidatedJobInput {
  if (!body || typeof body !== "object") {
    return {
      isValid: false,
      error: "Invalid request body format.",
      errorCode: "INVALID_REQUEST",
    };
  }

  const { url, mediaType, format, quality } = body;

  // 1. Validate Source URL
  if (!url || typeof url !== "string") {
    return {
      isValid: false,
      error: "Source media URL is required.",
      errorCode: "INVALID_REQUEST",
    };
  }

  const trimmedUrl = url.trim();
  if (trimmedUrl.length > 2048) {
    return {
      isValid: false,
      error: "URL exceeds maximum allowed length.",
      errorCode: "INVALID_REQUEST",
    };
  }

  // Path traversal check on URL string
  if (trimmedUrl.includes("../") || trimmedUrl.includes("..\\")) {
    return {
      isValid: false,
      error: "Path traversal attempt detected in URL.",
      errorCode: "INVALID_REQUEST",
    };
  }

  let parsedUrl: URL;
  try {
    const toParse = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
    parsedUrl = new URL(toParse);
  } catch {
    return {
      isValid: false,
      error: "Invalid source URL syntax.",
      errorCode: "INVALID_REQUEST",
    };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      isValid: false,
      error: "Only HTTP and HTTPS protocols are allowed.",
      errorCode: "INVALID_REQUEST",
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // SSRF Protection: Reject local and private network targets unless explicit test flag set
  if (
    BLOCKED_IP_REGEX.test(hostname) ||
    hostname === "localhost" ||
    hostname === "0.0.0.0"
  ) {
    // Allow local test URL only if NODE_ENV === 'test' or ALLOW_LOCAL_TEST_URLS === 'true'
    const allowLocal = process.env.NODE_ENV === "test" || process.env.ALLOW_LOCAL_TEST_URLS === "true";
    if (!allowLocal) {
      return {
        isValid: false,
        error: "Access to local or internal network targets is forbidden (SSRF protection).",
        errorCode: "INVALID_REQUEST",
      };
    }
  }

  // 2. Validate Media Type
  if (mediaType !== "video" && mediaType !== "audio") {
    return {
      isValid: false,
      error: "mediaType must be either 'video' or 'audio'.",
      errorCode: "UNSUPPORTED_FORMAT",
    };
  }

  // 3. Validate Format
  if (mediaType === "video") {
    if (format !== "mp4") {
      return {
        isValid: false,
        error: "Only 'mp4' format is allowed for video processing.",
        errorCode: "UNSUPPORTED_FORMAT",
      };
    }
  } else if (mediaType === "audio") {
    if (format !== "mp3" && format !== "m4a") {
      return {
        isValid: false,
        error: "Only 'mp3' or 'm4a' format is allowed for audio processing.",
        errorCode: "UNSUPPORTED_FORMAT",
      };
    }
  }

  // 4. Validate Quality
  let normalizedQuality = typeof quality === "string" ? quality.toLowerCase().trim() : "";
  // Standardize audio quality aliases (320kbps -> 320k)
  normalizedQuality = normalizedQuality.replace(/kbps$/, "k");

  if (mediaType === "video") {
    const validVideoQualities = ["best", "1080p", "720p", "480p", "360p"];
    if (!validVideoQualities.includes(normalizedQuality)) {
      return {
        isValid: false,
        error: "Invalid video quality specified. Must be best, 1080p, 720p, 480p, or 360p.",
        errorCode: "UNSUPPORTED_QUALITY",
      };
    }
  } else {
    const validAudioQualities = ["best", "320k", "256k", "192k", "128k"];
    if (!validAudioQualities.includes(normalizedQuality)) {
      return {
        isValid: false,
        error: "Invalid audio quality specified. Must be best, 320k, 256k, 192k, or 128k.",
        errorCode: "UNSUPPORTED_QUALITY",
      };
    }
  }

  return {
    isValid: true,
    url: parsedUrl.toString(),
    mediaType,
    format,
    quality: normalizedQuality,
  };
}
