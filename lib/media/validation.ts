import { SourcePlatform, FormatExtension, QualityOption, MediaType } from "./types";

const BLOCKED_IP_REGEX = /^(?:127\.|10\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|0\.|fc00:|fe80:|::1)/i;

export interface ValidationResult {
  isValid: boolean;
  normalizedUrl?: string;
  source?: SourcePlatform;
  error?: string;
}

export interface ParsedYouTubeUrl {
  platform: "youtube" | null;
  videoId: string | null;
}

export interface ParsedInstagramUrl {
  platform: "instagram" | null;
  mediaId: string | null;
}

/**
 * Reusable server-side parser for YouTube URLs.
 * Extracts 11-character YouTube Video ID stripping query params safely.
 */
export function parseYouTubeUrl(urlStr: string): ParsedYouTubeUrl {
  if (!urlStr || typeof urlStr !== "string") {
    return { platform: null, videoId: null };
  }

  try {
    let clean = urlStr.trim();
    if (!/^https?:\/\//i.test(clean)) {
      clean = `https://${clean}`;
    }
    const url = new URL(clean);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { platform: null, videoId: null };
    }

    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

    let rawId: string | null = null;

    if (hostname === "youtu.be") {
      const path = url.pathname.substring(1);
      rawId = path.split("/")[0];
    } else if (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "music.youtube.com"
    ) {
      if (url.pathname === "/watch" || url.pathname.startsWith("/watch/")) {
        rawId = url.searchParams.get("v");
      } else if (url.pathname.startsWith("/shorts/")) {
        const parts = url.pathname.split("/shorts/");
        if (parts[1]) rawId = parts[1].split("/")[0];
      } else if (url.pathname.startsWith("/embed/")) {
        const parts = url.pathname.split("/embed/");
        if (parts[1]) rawId = parts[1].split("/")[0];
      } else if (url.pathname.startsWith("/v/")) {
        const parts = url.pathname.split("/v/");
        if (parts[1]) rawId = parts[1].split("/")[0];
      }
    }

    if (rawId) {
      // Strip any query parameters (?si=..., &utm_..., #t=...) safely
      const cleanId = rawId.split("?")[0].split("&")[0].split("#")[0].trim();
      // Valid YouTube Video IDs are 11 characters long consisting of [a-zA-Z0-9_-]
      if (/^[a-zA-Z0-9_-]{11}$/.test(cleanId)) {
        return { platform: "youtube", videoId: cleanId };
      }
    }
  } catch {
    return { platform: null, videoId: null };
  }

  return { platform: null, videoId: null };
}

/**
 * Reusable server-side parser for Instagram Reel URLs.
 * Extracts media code stripping tracking params safely.
 */
export function parseInstagramUrl(urlStr: string): ParsedInstagramUrl {
  if (!urlStr || typeof urlStr !== "string") {
    return { platform: null, mediaId: null };
  }

  try {
    let clean = urlStr.trim();
    if (!/^https?:\/\//i.test(clean)) {
      clean = `https://${clean}`;
    }
    const url = new URL(clean);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { platform: null, mediaId: null };
    }

    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (hostname !== "instagram.com") {
      return { platform: null, mediaId: null };
    }

    const pathSegments = url.pathname.split("/").filter(Boolean);
    if (
      pathSegments.length >= 2 &&
      ["reel", "reels", "p", "tv"].includes(pathSegments[0].toLowerCase())
    ) {
      const code = pathSegments[1].split("?")[0].split("&")[0].split("#")[0].trim();
      if (code && /^[a-zA-Z0-9_-]{3,64}$/.test(code)) {
        return { platform: "instagram", mediaId: code };
      }
    }
  } catch {
    return { platform: null, mediaId: null };
  }

  return { platform: null, mediaId: null };
}

/**
 * Validates and normalizes user provided media URLs with strict SSRF protection.
 */
export function validateMediaUrl(rawUrl: string): ValidationResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { isValid: false, error: "Please enter a supported YouTube or Instagram URL." };
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) {
    return { isValid: false, error: "URL exceeds maximum allowed length." };
  }

  let parsed: URL;
  try {
    const urlToParse = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    parsed = new URL(urlToParse);
  } catch {
    return { isValid: false, error: "Please enter a supported YouTube or Instagram URL." };
  }

  // Enforce HTTP / HTTPS protocol only (reject file:, ftp:, data:, javascript:, etc.)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { isValid: false, error: "Please enter a supported YouTube or Instagram URL." };
  }

  const hostname = parsed.hostname.toLowerCase();

  // SSRF Protection: Prevent internal IP / localhost addresses
  if (BLOCKED_IP_REGEX.test(hostname) || hostname === "localhost") {
    return { isValid: false, error: "Access to local or internal network targets is forbidden." };
  }

  // YouTube URL parsing & normalization
  const ytResult = parseYouTubeUrl(trimmed);
  if (ytResult.platform === "youtube" && ytResult.videoId) {
    return {
      isValid: true,
      normalizedUrl: `https://www.youtube.com/watch?v=${ytResult.videoId}`,
      source: "youtube",
    };
  }

  // Instagram Reel URL parsing & normalization
  const igResult = parseInstagramUrl(trimmed);
  if (igResult.platform === "instagram" && igResult.mediaId) {
    return {
      isValid: true,
      normalizedUrl: `https://www.instagram.com/reel/${igResult.mediaId}/`,
      source: "instagram",
    };
  }

  return {
    isValid: false,
    error: "Please enter a supported YouTube or Instagram URL.",
  };
}

/**
 * Validates format and quality selection against server parameters
 */
export function validateDownloadOptions(
  mediaType: MediaType,
  format: FormatExtension,
  quality: QualityOption
): { isValid: boolean; error?: string } {
  if (mediaType === "video") {
    if (format !== "mp4") {
      return { isValid: false, error: "Only MP4 video format is currently supported." };
    }
    const validVideoQualities = ["best", "1080p", "720p", "480p", "360p"];
    if (!validVideoQualities.includes(quality)) {
      return { isValid: false, error: "Invalid video quality specified." };
    }
  } else if (mediaType === "audio") {
    if (format !== "mp3" && format !== "m4a") {
      return { isValid: false, error: "Only MP3 and M4A audio formats are supported." };
    }
    const validAudioQualities = ["best", "320kbps", "256kbps", "192kbps", "128kbps"];
    if (!validAudioQualities.includes(quality)) {
      return { isValid: false, error: "Invalid audio quality specified." };
    }
  } else {
    return { isValid: false, error: "Invalid media type." };
  }

  return { isValid: true };
}
