import { Info, ShieldCheck, CheckCircle2 } from "lucide-react";

interface StatusMessageProps {
  message: string;
  type?: "info" | "success" | "notice";
}

export function StatusMessage({ message, type = "info" }: StatusMessageProps) {
  const styles = {
    info: "bg-blue-50 border-blue-200 text-blue-900",
    success: "bg-emerald-50 border-emerald-200 text-emerald-900",
    notice: "bg-zinc-100 border-zinc-200 text-zinc-800",
  }[type];

  return (
    <div className={`p-4 rounded-2xl border text-xs sm:text-sm flex items-start gap-3 ${styles}`}>
      <div className="shrink-0 mt-0.5">
        {type === "success" ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        ) : type === "info" ? (
          <Info className="w-4 h-4 text-blue-600" />
        ) : (
          <ShieldCheck className="w-4 h-4 text-zinc-600" />
        )}
      </div>
      <div className="leading-relaxed">{message}</div>
    </div>
  );
}
