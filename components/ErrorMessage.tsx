import { AlertTriangle } from "lucide-react";
import { ErrorCode } from "@/lib/media/types";

interface ErrorMessageProps {
  error: string;
  errorCode?: ErrorCode;
  onDismiss?: () => void;
}

export function ErrorMessage({ error, onDismiss }: ErrorMessageProps) {
  return (
    <div
      className="w-full p-4 rounded-lg border border-red-200 bg-red-50 text-red-950 text-xs sm:text-sm flex items-start gap-3"
      role="alert"
    >
      <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
      <div className="flex-1 leading-relaxed">{error}</div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-xs font-medium underline text-red-800 hover:text-red-950 shrink-0"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
