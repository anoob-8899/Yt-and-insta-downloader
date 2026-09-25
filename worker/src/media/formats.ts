export interface FFmpegProfile {
  args: string[];
  outputExtension: string;
  mimeType: string;
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
  if (mediaType === "video" && format === "mp4") {
    switch (quality) {
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
        };
      case "best":
      default:
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
        };
    }
  }

  if (mediaType === "audio" && format === "mp3") {
    let bitrate = "320k";
    if (quality === "256k") bitrate = "256k";
    else if (quality === "192k") bitrate = "192k";
    else if (quality === "128k") bitrate = "128k";

    return {
      args: ["-vn", "-c:a", "libmp3lame", "-b:a", bitrate],
      outputExtension: "mp3",
      mimeType: "audio/mpeg",
    };
  }

  if (mediaType === "audio" && format === "m4a") {
    let bitrate = "256k";
    if (quality === "320k") bitrate = "320k";
    else if (quality === "192k") bitrate = "192k";
    else if (quality === "128k") bitrate = "128k";

    return {
      args: ["-vn", "-c:a", "aac", "-b:a", bitrate],
      outputExtension: "m4a",
      mimeType: "audio/mp4",
    };
  }

  return null;
}
