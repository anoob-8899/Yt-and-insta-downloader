"use client";

import Image from "next/image";
import { SourcePlatform } from "@/lib/media/types";

interface MediaPreviewProps {
  thumbnailUrl?: string;
  title: string;
  source?: SourcePlatform;
}

export function MediaPreview({ thumbnailUrl, title, source }: MediaPreviewProps) {
  const isVertical = source === "instagram";

  return (
    <div className="w-full bg-white rounded-xl border border-[#DCDDD8] overflow-hidden">
      <div
        className={`w-full relative bg-[#F7F8F4] flex items-center justify-center overflow-hidden ${
          isVertical ? "aspect-[9/16] max-h-[380px]" : "aspect-video"
        }`}
      >
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={title || "Media Thumbnail"}
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-[#6B6B67] p-8 text-center text-sm font-medium">
            <span>Thumbnail Unavailable</span>
          </div>
        )}
      </div>
    </div>
  );
}
