import { SourcePlatform } from "@/lib/media/types";
import { formatDuration } from "@/lib/utils";

interface MediaInfoProps {
  title: string;
  creator?: string;
  duration?: number;
  source?: SourcePlatform;
}

export function MediaInfo({ title, creator, duration, source }: MediaInfoProps) {
  const metaLine = [
    creator ? creator : null,
    duration && duration > 0 ? formatDuration(duration) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-1.5">
      {source && (
        <div className="text-xs font-semibold text-[#6B6B67] uppercase tracking-wider">
          {source === "youtube" ? "YouTube" : source === "instagram" ? "Instagram" : source}
        </div>
      )}

      <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#111111] leading-snug">
        {title}
      </h2>

      {metaLine && (
        <div className="text-xs sm:text-sm text-[#6B6B67] font-normal">
          {metaLine}
        </div>
      )}
    </div>
  );
}
