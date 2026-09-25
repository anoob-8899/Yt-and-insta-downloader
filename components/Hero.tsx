"use client";

import React from "react";
import { SupportedPlatforms } from "./SupportedPlatforms";

interface HeroProps {
  children?: React.ReactNode;
}

export function Hero({ children }: HeroProps) {
  return (
    <section className="w-full pt-10 pb-12 sm:pt-16 sm:pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center space-y-4 sm:space-y-6">
          {/* Eyebrow */}
          <div className="text-xs uppercase tracking-widest font-semibold text-[#6B6B67]">
            MEDIA DOWNLOADER
          </div>

          {/* Editorial Headline */}
          <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[#111111] leading-tight">
            Download your media.
          </h1>

          {/* Supporting Copy */}
          <p className="text-base sm:text-lg text-[#6B6B67] max-w-xl mx-auto font-normal leading-relaxed">
            Paste a supported URL, choose your format and quality, and download your authorized media.
          </p>

          {/* Downloader Container Slot */}
          <div className="pt-6 max-w-2xl mx-auto text-left">
            {children}
          </div>

          {/* Supported platforms list */}
          <div className="pt-6">
            <SupportedPlatforms />
          </div>
        </div>
      </div>
    </section>
  );
}
