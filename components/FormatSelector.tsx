"use client";

import { FormatExtension, MediaType } from "@/lib/media/types";

interface FormatSelectorProps {
  mediaType: MediaType;
  selectedFormat: FormatExtension;
  onChangeFormat: (format: FormatExtension) => void;
  disabled?: boolean;
}

export function FormatSelector({
  mediaType,
  selectedFormat,
  onChangeFormat,
  disabled,
}: FormatSelectorProps) {
  const formats: { value: FormatExtension; label: string }[] =
    mediaType === "video"
      ? [{ value: "mp4", label: "MP4" }]
      : [
          { value: "mp3", label: "MP3" },
          { value: "m4a", label: "M4A" },
        ];

  return (
    <div className="space-y-1.5">
      <label htmlFor="format-select" className="block text-xs font-semibold uppercase tracking-wider text-[#6B6B67]">
        File type
      </label>
      <select
        id="format-select"
        value={selectedFormat}
        onChange={(e) => onChangeFormat(e.target.value as FormatExtension)}
        disabled={disabled}
        className="w-full h-11 px-3 bg-white text-[#111111] border border-[#DCDDD8] rounded-lg text-sm font-medium focus:outline-none focus:border-[#111111] disabled:bg-zinc-100 disabled:text-zinc-400 cursor-pointer"
      >
        {formats.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  );
}
