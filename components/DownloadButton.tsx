"use client";

import { Loader2 } from "lucide-react";
import { MediaType, JobStatus } from "@/lib/media/types";

interface DownloadButtonProps {
  mediaType: MediaType;
  status: JobStatus;
  onClick: () => void;
  downloadUrl?: string;
  disabled?: boolean;
}

export function DownloadButton({
  mediaType,
  status,
  onClick,
  downloadUrl,
  disabled,
}: DownloadButtonProps) {
  const isProcessing =
    status === "pending" || status === "preparing" || status === "downloading" || status === "processing";
  const isCompleted = status === "completed";
  const isFailed = status === "failed" || status === "worker_unconfigured";

  if (isCompleted && downloadUrl) {
    return (
      <a
        href={downloadUrl}
        download
        className="w-full h-12 px-6 bg-[#111111] hover:bg-black/80 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-base"
      >
        <span>Download Processed File</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isProcessing}
      className={`w-full h-12 px-6 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-base ${
        isProcessing
          ? "bg-zinc-800 text-white cursor-wait opacity-90"
          : isFailed
          ? "bg-[#111111] text-white hover:bg-black/80"
          : disabled
          ? "bg-zinc-200 text-zinc-400 cursor-not-allowed"
          : "bg-[#111111] text-white hover:bg-black/80"
      }`}
    >
      {isProcessing ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Processing Media...</span>
        </>
      ) : isFailed ? (
        <span>Retry Download</span>
      ) : (
        <span>Download</span>
      )}
    </button>
  );
}
