import { NextRequest, NextResponse } from "next/server";
import { createDownloadJob } from "@/lib/media/processor";
import { checkRateLimit } from "@/lib/media/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const rateCheck = checkRateLimit(ip, 10, 60 * 1000);

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          jobId: "",
          status: "failed",
          progress: 0,
          error: "Rate limit exceeded. Please wait before creating new download jobs.",
          errorCode: "RATE_LIMIT_EXCEEDED",
          workerConfigured: false,
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { sourceUrl, mediaType, format, quality } = body;

    if (!sourceUrl || !mediaType || !format || !quality) {
      return NextResponse.json(
        {
          jobId: "",
          status: "failed",
          progress: 0,
          error: "Missing required media options (sourceUrl, mediaType, format, quality).",
          errorCode: "INVALID_URL",
          workerConfigured: false,
        },
        { status: 400 }
      );
    }

    const job = await createDownloadJob({
      sourceUrl,
      mediaType,
      format,
      quality,
    });

    return NextResponse.json(job);
  } catch {
    return NextResponse.json(
      {
        jobId: "",
        status: "failed",
        progress: 0,
        error: "An unexpected error occurred while processing download request.",
        errorCode: "PROCESSING_FAILED",
        workerConfigured: false,
      },
      { status: 500 }
    );
  }
}
