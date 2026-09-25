"use client";

import { Loader2 } from "lucide-react";

interface AnalyzeButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function AnalyzeButton({ onClick, isLoading, disabled }: AnalyzeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`w-full sm:w-auto h-[50px] px-7 bg-[#111111] text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-base shrink-0 ${
        disabled || isLoading
          ? "opacity-60 cursor-not-allowed"
          : "hover:bg-black/80"
      }`}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Analyzing...</span>
        </>
      ) : (
        <span>Analyze</span>
      )}
    </button>
  );
}
