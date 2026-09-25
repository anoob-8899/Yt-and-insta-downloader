"use client";

import { MediaFormatOption, QualityOption } from "@/lib/media/types";

interface QualitySelectorProps {
  availableOptions: MediaFormatOption[];
  selectedQuality: QualityOption;
  onChangeQuality: (quality: QualityOption) => void;
  disabled?: boolean;
}

export function QualitySelector({
  availableOptions,
  selectedQuality,
  onChangeQuality,
  disabled,
}: QualitySelectorProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="quality-select" className="block text-xs font-semibold uppercase tracking-wider text-[#6B6B67]">
        Quality
      </label>
      <select
        id="quality-select"
        value={selectedQuality}
        onChange={(e) => onChangeQuality(e.target.value as QualityOption)}
        disabled={disabled}
        className="w-full h-11 px-3 bg-white text-[#111111] border border-[#DCDDD8] rounded-lg text-sm font-medium focus:outline-none focus:border-[#111111] disabled:bg-zinc-100 disabled:text-zinc-400 cursor-pointer"
      >
        {availableOptions.map((opt) => {
          const extra = [opt.note, opt.filesizeEstimate].filter(Boolean).join(" · ");
          return (
            <option key={opt.id} value={opt.quality}>
              {opt.label} {extra ? `(${extra})` : ""}
            </option>
          );
        })}
      </select>
    </div>
  );
}
