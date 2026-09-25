"use client";

import { MediaType } from "@/lib/media/types";

interface MediaTypeSelectorProps {
  selected: MediaType;
  onChange: (type: MediaType) => void;
  disabled?: boolean;
}

export function MediaTypeSelector({ selected, onChange, disabled }: MediaTypeSelectorProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="media-type-select" className="block text-xs font-semibold uppercase tracking-wider text-[#6B6B67]">
        Media type
      </label>
      <select
        id="media-type-select"
        value={selected}
        onChange={(e) => onChange(e.target.value as MediaType)}
        disabled={disabled}
        className="w-full h-11 px-3 bg-white text-[#111111] border border-[#DCDDD8] rounded-lg text-sm font-medium focus:outline-none focus:border-[#111111] disabled:bg-zinc-100 disabled:text-zinc-400 cursor-pointer"
      >
        <option value="video">Video</option>
        <option value="audio">Audio</option>
      </select>
    </div>
  );
}
