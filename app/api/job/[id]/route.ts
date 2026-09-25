import { NextRequest, NextResponse } from "next/server";
import { getJobStatus } from "@/lib/media/processor";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id;
    if (!jobId) {
      return NextResponse.json(
        {
          jobId: "",
          status: "failed",
          progress: 0,
          error: "Job ID required.",
          errorCode: "PROCESSING_FAILED",
          workerConfigured: false,
        },
        { status: 400 }
      );
    }

    const job = await getJobStatus(jobId);
    return NextResponse.json(job);
  } catch {
    return NextResponse.json(
      {
        jobId: params.id || "",
        status: "failed",
        progress: 0,
        error: "Failed to poll job status.",
        errorCode: "PROCESSING_FAILED",
        workerConfigured: false,
      },
      { status: 500 }
    );
  }
}
