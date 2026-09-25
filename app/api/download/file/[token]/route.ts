import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token;
    if (!token) {
      return NextResponse.json(
        { error: "Download token is required.", errorCode: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    const workerUrl = process.env.MEDIA_WORKER_URL;
    const workerSecret = process.env.MEDIA_WORKER_SECRET;

    if (!workerUrl || !workerSecret) {
      return NextResponse.json(
        { error: "Media Processing Worker is not configured.", errorCode: "WORKER_UNCONFIGURED" },
        { status: 503 }
      );
    }

    // Call worker internal download endpoint with secret header
    const workerRes = await fetch(`${workerUrl}/download/${token}`, {
      headers: {
        "X-Mediaflow-Secret": workerSecret,
      },
      // Prevent automatic caching of temporary download stream
      cache: "no-store",
    });

    if (!workerRes.ok) {
      if (workerRes.status === 410 || workerRes.status === 404) {
        return NextResponse.json(
          { error: "Download reference has expired or is invalid.", errorCode: "JOB_EXPIRED" },
          { status: 410 }
        );
      }
      return NextResponse.json(
        { error: "Unable to retrieve processed media file.", errorCode: "STORAGE_FAILED" },
        { status: 500 }
      );
    }

    const contentType = workerRes.headers.get("Content-Type") || "application/octet-stream";
    const contentDisposition = workerRes.headers.get("Content-Disposition") || 'attachment; filename="download"';
    const contentLength = workerRes.headers.get("Content-Length");

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", contentType);
    responseHeaders.set("Content-Disposition", contentDisposition);
    if (contentLength) {
      responseHeaders.set("Content-Length", contentLength);
    }

    // Stream worker binary output safely to browser
    return new NextResponse(workerRes.body as any, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to download media file.", errorCode: "NETWORK_FAILURE" },
      { status: 500 }
    );
  }
}
