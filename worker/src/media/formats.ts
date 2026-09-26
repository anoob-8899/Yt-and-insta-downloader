export interface FFmpegProfile {
  args: string[];
  outputExtension: string;
  mimeType: string;
  quality: string;
}

/**
 * Returns controlled FFmpeg encoding profiles with fixed argument arrays.
 * Never concatenates arbitrary user input into command arguments.
 */
export function getFFmpegProfile(
  mediaType: "video" | "audio",
  format: "mp4" | "mp3" | "m4a",
  quality: string
): FFmpegProfile | null {
  const normQuality = (quality || "").toLowerCase().trim().replace(/kbps$/, "k");

  if (mediaType === "video" && format === "mp4") {
    switch (normQuality) {
      case "1080p":
        return {
          args: [
            "-vf",
            "scale=w=min(iw\\,1920):h=-2",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "22",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
          ],
          outputExtension: "mp4",
          mimeType: "video/mp4",
          quality: "1080p",
        };
      case "720p":
        return {
          args: [
            "-vf",
            "scale=w=min(iw\\,1280):h=-2",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-movflags",
            "+faststart",
          ],
          outputExtension: "mp4",
          mimeType: "video/mp4",
          quality: "720p",
        };
      case "480p":
        return {
          args: [
            "-vf",
            "scale=w=min(iw\\,854):h=-2",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "24",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
          ],
          outputExtension: "mp4",
          mimeType: "video/mp4",
          quality: "480p",
        };
      case "360p":
        return {
          args: [
            "-vf",
            "scale=w=min(iw\\,640):h=-2",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "26",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-movflags",
            "+faststart",
          ],
          outputExtension: "mp4",
          mimeType: "video/mp4",
          quality: "360p",
        };
      case "best":
        return {
          args: [
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
          ],
          outputExtension: "mp4",
          mimeType: "video/mp4",
          quality: "best",
        };
      default:
        return null;
    }
  }

  if (mediaType === "audio" && format === "mp3") {
    const validMp3Qualities = ["best", "320k", "256k", "192k", "128k"];
    if (!validMp3Qualities.includes(normQuality)) {
      return null;
    }

    let bitrate = "320k";
    if (normQuality === "256k") bitrate = "256k";
    else if (normQuality === "192k") bitrate = "192k";
    else if (normQuality === "128k") bitrate = "128k";

    return {
      args: ["-vn", "-c:a", "libmp3lame", "-b:a", bitrate],
      outputExtension: "mp3",
      mimeType: "audio/mpeg",
      quality: normQuality === "best" ? "320k" : normQuality,
    };
  }

  if (mediaType === "audio" && format === "m4a") {
    const validM4aQualities = ["best", "320k", "256k", "192k", "128k"];
    if (!validM4aQualities.includes(normQuality)) {
      return null;
    }

    let bitrate = "256k";
    if (normQuality === "320k") bitrate = "320k";
    else if (normQuality === "192k") bitrate = "192k";
    else if (normQuality === "128k") bitrate = "128k";

    return {
      args: ["-vn", "-c:a", "aac", "-b:a", bitrate],
      outputExtension: "m4a",
      mimeType: "audio/mp4",
      quality: normQuality === "best" ? "256k" : normQuality,
    };
  }

  return null;
}
