import { Youtube, Instagram } from "lucide-react";

export function SupportedPlatforms() {
  return (
    <div id="supported-platforms" className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs sm:text-sm font-medium text-[#6B6B67]">
      <span className="text-xs uppercase tracking-wider text-[#6B6B67] font-semibold w-full sm:w-auto text-center">
        Supported Platforms:
      </span>
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-md border border-[#DCDDD8] bg-white text-[#111111]">
        <Youtube className="w-4 h-4 text-red-600" />
        <span>YouTube</span>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-md border border-[#DCDDD8] bg-white text-[#111111]">
        <Instagram className="w-4 h-4 text-pink-600" />
        <span>Instagram</span>
      </div>
    </div>
  );
}
