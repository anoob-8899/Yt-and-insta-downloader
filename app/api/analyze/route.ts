import { NextRequest, NextResponse } from "next/server";
import { analyzeMedia } from "@/lib/media/analyzer";
import { checkRateLimit } from "@/lib/media/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const rateCheck = checkRateLimit(ip, 20, 60 * 1000);

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many analysis requests. Please wait a minute before trying again.",
          errorCode: "RATE_LIMIT_EXCEEDED",
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Please provide a valid YouTube or Instagram URL.",
          errorCode: "INVALID_URL",
        },
        { status: 400 }
      );
    }

    const result = await analyzeMedia(url);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "An unexpected server error occurred during URL analysis.",
        errorCode: "PROCESSING_FAILED",
      },
      { status: 500 }
    );
  }
}
