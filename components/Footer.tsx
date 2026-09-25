import Link from "next/link";

export function Footer() {
  return (
    <footer className="w-full bg-[#F7F8F4] border-t border-[#DCDDD8] py-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <Link href="/" className="flex items-center">
              <span className="font-serif text-lg font-bold tracking-tight text-[#111111]">
                MEDIAFLOW
              </span>
            </Link>
            <p className="text-xs text-[#6B6B67]">
              Classic media utility for authorized YouTube & Instagram content.
            </p>
          </div>

          <div className="flex flex-wrap gap-5 text-xs font-medium text-[#6B6B67]">
            <Link href="/" className="hover:text-[#111111] transition-colors">
              Home
            </Link>
            <Link href="#how-it-works" className="hover:text-[#111111] transition-colors">
              How it works
            </Link>
            <Link href="#supported-platforms" className="hover:text-[#111111] transition-colors">
              Supported
            </Link>
            <span>•</span>
            <span className="text-[#6B6B67]">Privacy</span>
            <span className="text-[#6B6B67]">Terms</span>
          </div>
        </div>

        <div className="pt-4 border-t border-[#DCDDD8] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#6B6B67]">
          <div>© {new Date().getFullYear()} MEDIAFLOW. All rights reserved.</div>
          <div>Utility media downloader</div>
        </div>
      </div>
    </footer>
  );
}
