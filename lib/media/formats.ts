import { MediaFormatOption, SourcePlatform } from "./types";

export const DEFAULT_VIDEO_FORMATS: MediaFormatOption[] = [
  {
    id: "mp4-best",
    mediaType: "video",
    format: "mp4",
    quality: "best",
    label: "Best Available (HD/4K)",
    note: "Highest resolution provided by source",
    filesizeEstimate: "~45-120 MB",
  },
  {
    id: "mp4-1080p",
    mediaType: "video",
    format: "mp4",
    quality: "1080p",
    label: "Full HD (1080p)",
    note: "1920x1080 standard high definition",
    filesizeEstimate: "~35 MB",
  },
  {
    id: "mp4-720p",
    mediaType: "video",
    format: "mp4",
    quality: "720p",
    label: "HD (720p)",
    note: "1280x720 balanced mobile quality",
    filesizeEstimate: "~18 MB",
  },
  {
    id: "mp4-480p",
    mediaType: "video",
    format: "mp4",
    quality: "480p",
    label: "Standard (480p)",
    note: "Compact size",
    filesizeEstimate: "~9 MB",
  },
];

export const DEFAULT_AUDIO_FORMATS: MediaFormatOption[] = [
  {
    id: "mp3-best",
    mediaType: "audio",
    format: "mp3",
    quality: "best",
    label: "MP3 (Best Available)",
    note: "Highest bit-rate audio stream extracted",
    filesizeEstimate: "~7 MB",
  },
  {
    id: "mp3-320",
    mediaType: "audio",
    format: "mp3",
    quality: "320kbps",
    label: "MP3 (320 kbps)",
    note: "High quality audio preset",
    filesizeEstimate: "~8 MB",
  },
  {
    id: "m4a-256",
    mediaType: "audio",
    format: "m4a",
    quality: "256kbps",
    label: "M4A (AAC 256 kbps)",
    note: "Native container format",
    filesizeEstimate: "~5 MB",
  },
];

export function getAvailableFormatsForSource(source: SourcePlatform): MediaFormatOption[] {
  if (source === "instagram") {
    // Instagram Reels are typically fixed 1080x1920 vertical videos
    return [
      {
        id: "insta-mp4-hd",
        mediaType: "video",
        format: "mp4",
        quality: "1080p",
        label: "Instagram Reel (Original HD)",
        note: "Original reel quality",
        filesizeEstimate: "~15-30 MB",
      },
      {
        id: "insta-mp3-audio",
        mediaType: "audio",
        format: "mp3",
        quality: "320kbps",
        label: "Audio Track (MP3 320kbps)",
        note: "Extracted audio stream",
        filesizeEstimate: "~3 MB",
      }
    ];
  }

  return [...DEFAULT_VIDEO_FORMATS, ...DEFAULT_AUDIO_FORMATS];
}
