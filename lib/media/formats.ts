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
  {
    id: "mp4-360p",
    mediaType: "video",
    format: "mp4",
    quality: "360p",
    label: "Mobile (360p)",
    note: "Low data usage",
    filesizeEstimate: "~5 MB",
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
    id: "mp3-320k",
    mediaType: "audio",
    format: "mp3",
    quality: "320k",
    label: "MP3 (320 kbps)",
    note: "High quality audio preset",
    filesizeEstimate: "~8 MB",
  },
  {
    id: "mp3-256k",
    mediaType: "audio",
    format: "mp3",
    quality: "256k",
    label: "MP3 (256 kbps)",
    note: "Standard high audio preset",
    filesizeEstimate: "~6 MB",
  },
  {
    id: "mp3-192k",
    mediaType: "audio",
    format: "mp3",
    quality: "192k",
    label: "MP3 (192 kbps)",
    note: "Medium audio preset",
    filesizeEstimate: "~4.5 MB",
  },
  {
    id: "mp3-128k",
    mediaType: "audio",
    format: "mp3",
    quality: "128k",
    label: "MP3 (128 kbps)",
    note: "Compact audio preset",
    filesizeEstimate: "~3 MB",
  },
  {
    id: "m4a-best",
    mediaType: "audio",
    format: "m4a",
    quality: "best",
    label: "M4A (Best Available)",
    note: "Native AAC audio container",
    filesizeEstimate: "~6 MB",
  },
  {
    id: "m4a-256k",
    mediaType: "audio",
    format: "m4a",
    quality: "256k",
    label: "M4A (AAC 256 kbps)",
    note: "Native container format",
    filesizeEstimate: "~5 MB",
  },
  {
    id: "m4a-192k",
    mediaType: "audio",
    format: "m4a",
    quality: "192k",
    label: "M4A (AAC 192 kbps)",
    note: "Standard audio format",
    filesizeEstimate: "~4 MB",
  },
  {
    id: "m4a-128k",
    mediaType: "audio",
    format: "m4a",
    quality: "128k",
    label: "M4A (AAC 128 kbps)",
    note: "Compact AAC format",
    filesizeEstimate: "~2.5 MB",
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
        quality: "320k",
        label: "Audio Track (MP3 320kbps)",
        note: "Extracted audio stream",
        filesizeEstimate: "~3 MB",
      },
    ];
  }

  return [...DEFAULT_VIDEO_FORMATS, ...DEFAULT_AUDIO_FORMATS];
}
