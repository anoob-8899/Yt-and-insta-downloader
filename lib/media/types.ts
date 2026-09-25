export type SourcePlatform = 'youtube' | 'instagram';

export type PlatformStatus =
  | 'SUPPORTED'
  | 'UNAVAILABLE'
  | 'UNSUPPORTED'
  | 'INVALID'
  | 'RATE_LIMITED'
  | 'TEMPORARY_ERROR';

export type MediaType = 'video' | 'audio';

export type VideoFormat = 'mp4';
export type AudioFormat = 'mp3' | 'm4a';
export type FormatExtension = VideoFormat | AudioFormat;

export type VideoQuality = 'best' | '1080p' | '720p' | '480p' | '360p';
export type AudioQuality = 'best' | '320kbps' | '256kbps' | '192kbps' | '128kbps' | '320k' | '256k' | '192k' | '128k';
export type QualityOption = VideoQuality | AudioQuality;

export interface MediaFormatOption {
  id: string;
  mediaType: MediaType;
  format: FormatExtension;
  quality: QualityOption;
  label: string;
  note?: string;
  filesizeEstimate?: string;
}

export interface AnalyzeRequest {
  url: string;
}

export type ErrorCode =
  | 'INVALID_URL'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED_WORKER'
  | 'UNSUPPORTED_PLATFORM'
  | 'PRIVATE_CONTENT'
  | 'UNAVAILABLE_MEDIA'
  | 'SOURCE_UNAVAILABLE'
  | 'PREVIEW_UNAVAILABLE'
  | 'UNSUPPORTED_FORMAT'
  | 'UNSUPPORTED_QUALITY'
  | 'INPUT_TOO_LARGE'
  | 'PROCESSING_TIMEOUT'
  | 'PROCESSING_FAILED'
  | 'STORAGE_FAILED'
  | 'JOB_EXPIRED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'RATE_LIMITED'
  | 'WORKER_UNCONFIGURED'
  | 'NETWORK_FAILURE';

export interface AnalyzeResponse {
  success: boolean;
  source?: SourcePlatform;
  videoId?: string;
  id?: string;
  title?: string;
  creator?: string;
  duration?: number;
  thumbnailUrl?: string;
  previewUrl?: string;
  status?: string;
  formats?: MediaFormatOption[];
  error?: string;
  errorCode?: ErrorCode;
  workerConfigured?: boolean;
}

export interface DownloadRequest {
  sourceUrl: string;
  mediaType: MediaType;
  format: FormatExtension;
  quality: QualityOption;
}

export type JobStatus =
  | 'idle'
  | 'pending'
  | 'preparing'
  | 'downloading'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'worker_unconfigured';

export interface JobResponse {
  jobId: string;
  status: JobStatus;
  progress: number; // 0 to 100
  stepMessage?: string;
  downloadUrl?: string;
  filename?: string;
  error?: string;
  errorCode?: ErrorCode;
  workerConfigured: boolean;
}
