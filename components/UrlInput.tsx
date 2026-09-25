"use client";

import React from "react";
import { Link2, X } from "lucide-react";

interface UrlInputProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  error?: boolean;
}

export function UrlInput({ value, onChange, onSubmit, disabled, error }: UrlInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !disabled) {
      e.preventDefault();
      onSubmit();
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onChange(text);
    } catch {
      // Clipboard permissions fallback
    }
  };

  return (
    <div className="relative w-full">
      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B6B67] pointer-events-none">
        <Link2 className="w-5 h-5" />
      </div>
      
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Paste a YouTube or Instagram URL..."
        className={`w-full pl-11 pr-20 py-3.5 text-base bg-white rounded-lg border transition-colors outline-none text-[#111111] placeholder:text-[#6B6B67]/70 ${
          error
            ? "border-red-500 focus:border-red-600"
            : "border-[#DCDDD8] focus:border-[#111111]"
        } ${disabled ? "bg-zinc-100 text-zinc-400 cursor-not-allowed" : ""}`}
        aria-label="Media URL Input"
      />

      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          disabled={disabled}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#6B6B67] hover:text-[#111111] rounded hover:bg-black/5 transition-colors"
          aria-label="Clear URL"
        >
          <X className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={handlePaste}
          disabled={disabled}
          className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-medium text-[#6B6B67] hover:text-[#111111] bg-[#F7F8F4] hover:bg-zinc-200 border border-[#DCDDD8] rounded transition-colors hidden sm:block"
        >
          Paste
        </button>
      )}
    </div>
  );
}
