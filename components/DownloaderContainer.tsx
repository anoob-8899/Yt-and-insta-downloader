"use client";

import { useState, useEffect } from "react";
import { UrlInput } from "./UrlInput";
import { AnalyzeButton } from "./AnalyzeButton";
import { MediaPreview } from "./MediaPreview";
import { MediaInfo } from "./MediaInfo";
import { MediaTypeSelector } from "./MediaTypeSelector";
import { FormatSelector } from "./FormatSelector";
import { QualitySelector } from "./QualitySelector";
import { DownloadButton } from "./DownloadButton";
import { ProgressBar } from "./ProgressBar";
import { ErrorMessage } from "./ErrorMessage";
import {
  AnalyzeResponse,
  ErrorCode,
  FormatExtension,
  JobResponse,
  MediaFormatOption,
  MediaType,
  QualityOption,
} from "@/lib/media/types";

export function DownloaderContainer() {
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(null);

  // Form Selection States
  const [mediaType, setMediaType] = useState<MediaType>("video");
  const [format, setFormat] = useState<FormatExtension>("mp4");
  const [quality, setQuality] = useState<QualityOption>("best");

  // Processing & Job States
  const [job, setJob] = useState<JobResponse | null>(null);
  const [isProcessingJob, setIsProcessingJob] = useState(false);

  // Global Error State
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<ErrorCode | undefined>(undefined);

  // Debug log for worker configuration state without exposing to public UI
  useEffect(() => {
    if (analysisResult && !analysisResult.workerConfigured) {
      console.debug(
        "[DEBUG] CON 01 Mode: Analysis complete. MEDIA_WORKER_URL background worker not connected."
      );
    }
  }, [analysisResult]);

  const handleAnalyze = async () => {
    if (!url || !url.trim()) {
      setError("Please paste a supported YouTube or Instagram URL.");
      setErrorCode("INVALID_URL");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setErrorCode(undefined);
    setJob(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data: AnalyzeResponse = await res.json();

      if (!data.success) {
        setError(data.error || "Unable to analyze URL.");
        setErrorCode(data.errorCode);
        setAnalysisResult(null);
      } else {
        setAnalysisResult(data);
        if (data.formats && data.formats.length > 0) {
          const firstOpt = data.formats[0];
          setMediaType(firstOpt.mediaType);
          setFormat(firstOpt.format);
          setQuality(firstOpt.quality);
        }
      }
    } catch {
      setError("Network error occurred during URL analysis. Please check your connection.");
      setErrorCode("NETWORK_FAILURE");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStartDownload = async () => {
    if (!analysisResult) return;

    setIsProcessingJob(true);
    setError(null);
    setErrorCode(undefined);

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: url,
          mediaType,
          format,
          quality,
        }),
      });

      const data: JobResponse = await res.json();
      setJob(data);

      if (data.status === "failed" || data.status === "worker_unconfigured") {
        setError(data.error || "Failed to start media processing job.");
        setErrorCode(data.errorCode);
      } else if (data.jobId && data.status !== "completed") {
        pollJobStatus(data.jobId);
      }
    } catch {
      setError("Failed to initiate processing job with backend worker.");
      setErrorCode("NETWORK_FAILURE");
    } finally {
      setIsProcessingJob(false);
    }
  };

  const pollJobStatus = async (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/job/${jobId}`);
        const data: JobResponse = await res.json();
        setJob(data);

        if (
          data.status === "completed" ||
          data.status === "failed" ||
          data.status === "worker_unconfigured"
        ) {
          clearInterval(interval);
          if (data.status === "failed" || data.status === "worker_unconfigured") {
            setError(data.error || "Processing failed.");
            setErrorCode(data.errorCode);
          }
        }
      } catch {
        clearInterval(interval);
        setError("Job polling connection lost.");
        setErrorCode("NETWORK_FAILURE");
      }
    }, 2000);
  };

  const currentAvailableOptions: MediaFormatOption[] = (
    analysisResult?.formats || []
  ).filter((opt) => opt.mediaType === mediaType && opt.format === format);

  const handleMediaTypeChange = (newType: MediaType) => {
    setMediaType(newType);
    const defaultFormat: FormatExtension = newType === "video" ? "mp4" : "mp3";
    setFormat(defaultFormat);
    const matching = (analysisResult?.formats || []).filter(
      (opt) => opt.mediaType === newType && opt.format === defaultFormat
    );
    if (matching.length > 0) {
      setQuality(matching[0].quality);
    }
  };

  const handleFormatChange = (newFormat: FormatExtension) => {
    setFormat(newFormat);
    const matching = (analysisResult?.formats || []).filter(
      (opt) => opt.mediaType === mediaType && opt.format === newFormat
    );
    if (matching.length > 0) {
      setQuality(matching[0].quality);
    }
  };

  return (
    <div id="downloader" className="w-full space-y-6">
      {/* URL Input Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <UrlInput
            value={url}
            onChange={(val) => {
              setUrl(val);
              if (error) setError(null);
            }}
            onSubmit={handleAnalyze}
            disabled={isAnalyzing || isProcessingJob}
            error={Boolean(error)}
          />
        </div>
        <AnalyzeButton
          onClick={handleAnalyze}
          isLoading={isAnalyzing}
          disabled={!url.trim() || isProcessingJob}
        />
      </div>

      {/* Global Error Banner */}
      {error && (
        <ErrorMessage
          error={error}
          errorCode={errorCode}
          onDismiss={() => setError(null)}
        />
      )}

      {/* Media Analysis Result Panel */}
      {analysisResult && (
        <div className="bg-white rounded-2xl p-5 sm:p-7 border border-[#DCDDD8] space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-start">
            
            {/* Column 1: Static Media Thumbnail (45-55% width) */}
            <div className="md:col-span-5">
              <MediaPreview
                title={analysisResult.title || "Title unavailable"}
                thumbnailUrl={analysisResult.thumbnailUrl}
                source={analysisResult.source}
              />
            </div>

            {/* Column 2: Media Info & Download Options */}
            <div className="md:col-span-7 space-y-5">
              <MediaInfo
                title={analysisResult.title || "Title unavailable"}
                creator={analysisResult.creator}
                duration={analysisResult.duration}
                source={analysisResult.source}
              />

              <div className="border-t border-[#DCDDD8]" />

              <div className="space-y-4">
                <MediaTypeSelector
                  selected={mediaType}
                  onChange={handleMediaTypeChange}
                  disabled={isProcessingJob}
                />

                <FormatSelector
                  mediaType={mediaType}
                  selectedFormat={format}
                  onChangeFormat={handleFormatChange}
                  disabled={isProcessingJob}
                />

                <QualitySelector
                  availableOptions={currentAvailableOptions}
                  selectedQuality={quality}
                  onChangeQuality={(q) => setQuality(q)}
                  disabled={isProcessingJob}
                />
              </div>

              {job && job.status !== "failed" && job.status !== "worker_unconfigured" && (
                <ProgressBar
                  progress={job.progress}
                  stepMessage={job.stepMessage}
                />
              )}

              <DownloadButton
                mediaType={mediaType}
                status={job?.status || "idle"}
                onClick={handleStartDownload}
                downloadUrl={job?.downloadUrl}
                disabled={isProcessingJob}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
