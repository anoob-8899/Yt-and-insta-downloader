interface ProgressBarProps {
  progress: number; // 0 to 100
  stepMessage?: string;
}

export function ProgressBar({ progress, stepMessage }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div className="w-full space-y-2 p-3 bg-white border border-[#DCDDD8] rounded-lg">
      <div className="flex items-center justify-between text-xs font-medium text-[#111111]">
        <span>{stepMessage || "Processing media..."}</span>
        <span className="font-mono text-[#6B6B67]">{clamped}%</span>
      </div>
      <div className="w-full h-2 bg-[#F7F8F4] border border-[#DCDDD8] rounded overflow-hidden">
        <div
          className="h-full bg-[#111111] transition-all duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
