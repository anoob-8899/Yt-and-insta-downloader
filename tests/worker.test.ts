import http from "http";
import fs from "fs";
import path from "path";
import assert from "assert";
import { spawnSync } from "child_process";
import app from "../worker/src/index";
import { validateWorkerJobInput } from "../worker/src/media/validation";
import { getFFmpegProfile } from "../worker/src/media/formats";
import { runFFmpegProcess, detectFFmpegPath } from "../worker/src/media/ffmpeg";
import {
  createDownloadToken,
  getDownloadToken,
  getJobFilePath,
  safeDeleteFile,
  cleanupExpiredTokensAndFiles,
} from "../worker/src/storage/temporaryStorage";
import { handleCreateWorkerJob } from "../worker/src/jobs/createJob";
import { handleGetWorkerJob } from "../worker/src/jobs/getJob";
import { stopCleanupTask } from "../worker/src/storage/cleanup";

const TEST_SECRET = "test_worker_secret_123";
process.env.MEDIA_WORKER_SECRET = TEST_SECRET;
process.env.ALLOW_LOCAL_TEST_URLS = "true";

let testServer: http.Server | null = null;
let testMediaServer: http.Server | null = null;
let testMediaUrl = "";
const tempTestFiles: string[] = [];

// Helper to create a small valid MP4 test file using FFmpeg
function generateTestMediaFile(): string {
  const ffmpegBin = detectFFmpegPath();
  if (!ffmpegBin) {
    throw new Error("FFmpeg required for running real worker processing tests.");
  }

  const testFile = path.resolve(process.cwd(), "worker", "temp", "test_sample.mp4");
  if (!fs.existsSync(testFile)) {
    // Generate 1-second synthetic video/audio test file
    const gen = spawnSync(ffmpegBin, [
      "-y",
      "-f", "lavfi", "-i", "testsrc=duration=1:size=320x240:rate=10",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
      "-c:v", "libx264", "-c:a", "aac",
      testFile,
    ]);
    if (gen.status !== 0 || !fs.existsSync(testFile)) {
      throw new Error("Failed to generate test media file with FFmpeg.");
    }
  }
  return testFile;
}

async function setupServers(): Promise<number> {
  const samplePath = generateTestMediaFile();

  // 1. Serve synthetic test media over HTTP
  testMediaServer = http.createServer((req, res) => {
    if (req.url === "/sample.mp4") {
      const stat = fs.statSync(samplePath);
      res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Content-Length": stat.size,
      });
      fs.createReadStream(samplePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  if (!testMediaServer) {
    throw new Error("Failed to create testMediaServer");
  }

  await new Promise<void>((resolve) => {
    testMediaServer!.listen(0, "127.0.0.1", () => resolve());
  });

  const mediaAddress = testMediaServer.address();
  if (!mediaAddress || typeof mediaAddress === "string") {
    throw new Error("Invalid testMediaServer address");
  }
  testMediaUrl = `http://127.0.0.1:${mediaAddress.port}/sample.mp4`;

  // 2. Start Worker Express App
  await new Promise<void>((resolve) => {
    testServer = app.listen(0, "127.0.0.1", () => resolve());
  });

  if (!testServer) {
    throw new Error("Failed to create testServer");
  }

  const workerAddress = testServer.address();
  if (!workerAddress || typeof workerAddress === "string") {
    throw new Error("Invalid testServer address");
  }
  return workerAddress.port;
}

function makeWorkerRequest(
  port: number,
  method: string,
  path: string,
  secretHeader: string | null,
  body?: any
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : "";
    const headers: Record<string, string> = {};
    if (body) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(postData).toString();
    }
    if (secretHeader !== null) {
      headers["X-Mediaflow-Secret"] = secretHeader;
    }

    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let parsed = {};
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode || 500, body: parsed, headers: res.headers });
        });
      }
    );

    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log("==================================================");
  console.log("RUNNING CON 03 MEDIA WORKER SUITE");
  console.log("==================================================\n");

  const port = await setupServers();
  let passedCount = 0;
  let totalCount = 0;

  async function test(name: string, fn: () => Promise<void>) {
    totalCount++;
    try {
      await fn();
      console.log(`✓ [PASS] ${name}`);
      passedCount++;
    } catch (err: any) {
      console.error(`✗ [FAIL] ${name}`);
      console.error(`  Error: ${err.message || err}`);
    }
  }

  // TEST 1: Worker Authentication Validation
  await test("Worker Auth: Reject request missing secret header with 401", async () => {
    const res = await makeWorkerRequest(port, "POST", "/jobs", null, {
      url: testMediaUrl,
      mediaType: "video",
      format: "mp4",
      quality: "720p",
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, "UNAUTHORIZED_WORKER");
  });

  await test("Worker Auth: Reject request with invalid secret header with 401", async () => {
    const res = await makeWorkerRequest(port, "POST", "/jobs", "wrong_secret", {
      url: testMediaUrl,
      mediaType: "video",
      format: "mp4",
      quality: "720p",
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, "UNAUTHORIZED_WORKER");
  });

  // TEST 2: Input Validation Tests
  await test("Validation: Reject unsupported format", async () => {
    const val = validateWorkerJobInput({
      url: testMediaUrl,
      mediaType: "video",
      format: "avi",
      quality: "720p",
    });
    assert.strictEqual(val.isValid, false);
    assert.strictEqual(val.errorCode, "UNSUPPORTED_FORMAT");
  });

  await test("Validation: Reject invalid quality", async () => {
    const val = validateWorkerJobInput({
      url: testMediaUrl,
      mediaType: "video",
      format: "mp4",
      quality: "9999p",
    });
    assert.strictEqual(val.isValid, false);
    assert.strictEqual(val.errorCode, "UNSUPPORTED_QUALITY");
  });

  await test("Validation: Path traversal prevention", async () => {
    const val = validateWorkerJobInput({
      url: "https://example.com/../../etc/passwd",
      mediaType: "video",
      format: "mp4",
      quality: "720p",
    });
    assert.strictEqual(val.isValid, false);
    assert.strictEqual(val.errorCode, "INVALID_REQUEST");
  });

  await test("Validation: SSRF prevention (block local metadata IP)", async () => {
    delete process.env.ALLOW_LOCAL_TEST_URLS;
    const val = validateWorkerJobInput({
      url: "http://169.254.169.254/latest/meta-data/",
      mediaType: "video",
      format: "mp4",
      quality: "720p",
    });
    process.env.ALLOW_LOCAL_TEST_URLS = "true";
    assert.strictEqual(val.isValid, false);
    assert.strictEqual(val.errorCode, "INVALID_REQUEST");
  });

  // TEST 3: Real Video Processing -> MP4
  await test("Real Processing: Video -> MP4 conversion", async () => {
    const res = await makeWorkerRequest(port, "POST", "/jobs", TEST_SECRET, {
      url: testMediaUrl,
      mediaType: "video",
      format: "mp4",
      quality: "720p",
    });
    assert.strictEqual(res.status, 201);
    const jobId = res.body.id;
    assert.ok(jobId);

    // Poll until complete
    let completed = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const poll = await makeWorkerRequest(port, "GET", `/jobs/${jobId}`, TEST_SECRET);
      if (poll.body.status === "COMPLETED") {
        completed = true;
        assert.strictEqual(poll.body.progress, 100);
        assert.ok(poll.body.downloadToken);
        assert.ok(poll.body.downloadUrl);

        // Verify download token file exists
        const tokenRec = getDownloadToken(poll.body.downloadToken);
        assert.ok(tokenRec);
        assert.strictEqual(fs.existsSync(tokenRec.filePath), true);
        assert.ok(fs.statSync(tokenRec.filePath).size > 0);
        break;
      }
      if (poll.body.status === "FAILED") {
        assert.fail(`Job failed: ${poll.body.error}`);
      }
    }
    assert.strictEqual(completed, true, "Job did not complete in time");
  });

  // TEST 4: Real Audio Extraction -> MP3
  await test("Real Processing: Audio -> MP3 extraction", async () => {
    const res = await makeWorkerRequest(port, "POST", "/jobs", TEST_SECRET, {
      url: testMediaUrl,
      mediaType: "audio",
      format: "mp3",
      quality: "320k",
    });
    assert.strictEqual(res.status, 201);
    const jobId = res.body.id;

    let completed = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const poll = await makeWorkerRequest(port, "GET", `/jobs/${jobId}`, TEST_SECRET);
      if (poll.body.status === "COMPLETED") {
        completed = true;
        assert.strictEqual(poll.body.mimeType, "audio/mpeg");
        break;
      }
      if (poll.body.status === "FAILED") {
        assert.fail(`Audio MP3 job failed: ${poll.body.error}`);
      }
    }
    assert.strictEqual(completed, true);
  });

  // TEST 5: Real Audio Extraction -> M4A
  await test("Real Processing: Audio -> M4A extraction", async () => {
    const res = await makeWorkerRequest(port, "POST", "/jobs", TEST_SECRET, {
      url: testMediaUrl,
      mediaType: "audio",
      format: "m4a",
      quality: "256k",
    });
    assert.strictEqual(res.status, 201);
    const jobId = res.body.id;

    let completed = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const poll = await makeWorkerRequest(port, "GET", `/jobs/${jobId}`, TEST_SECRET);
      if (poll.body.status === "COMPLETED") {
        completed = true;
        assert.strictEqual(poll.body.mimeType, "audio/mp4");
        break;
      }
      if (poll.body.status === "FAILED") {
        assert.fail(`Audio M4A job failed: ${poll.body.error}`);
      }
    }
    assert.strictEqual(completed, true);
  });

  // TEST 6: Download Token Validation & Stream
  await test("Download Token: Stream binary file via token", async () => {
    const sampleFile = generateTestMediaFile();
    const tokenRec = createDownloadToken("test_job_1", sampleFile, "mediaflow_test.mp4", "video/mp4");

    const dlRes = await makeWorkerRequest(port, "GET", `/download/${tokenRec.token}`, TEST_SECRET);
    assert.strictEqual(dlRes.status, 200);
    assert.strictEqual(dlRes.headers["content-type"], "video/mp4");
  });

  // TEST 7: Expired Token Rejection
  await test("Download Token: Reject expired or invalid token with 410/404", async () => {
    const dlRes = await makeWorkerRequest(port, "GET", "/download/non_existent_token_hex", TEST_SECRET);
    assert.strictEqual(dlRes.status, 410);
    assert.strictEqual(dlRes.body.code, "JOB_EXPIRED");
  });

  // TEST 8: File Cleanup Verification
  await test("Cleanup: Expired files are automatically cleaned up", async () => {
    const dummyPath = getJobFilePath("cleanup_test", "mp4");
    fs.writeFileSync(dummyPath, "dummy test data");

    const record = createDownloadToken("cleanup_test", dummyPath, "test.mp4", "video/mp4");
    record.expiresAt = Date.now() - 1000; // Force immediate expiration

    cleanupExpiredTokensAndFiles();
    assert.strictEqual(fs.existsSync(dummyPath), false);
    assert.strictEqual(getDownloadToken(record.token), null);
  });

  // Tear down servers and cleanup interval
  stopCleanupTask();
  testServer?.close();
  testMediaServer?.close();

  console.log(`\n==================================================`);
  console.log(`TEST RESULTS: ${passedCount} / ${totalCount} PASSED`);
  console.log(`==================================================\n`);

  if (passedCount !== totalCount) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Fatal test runner failure:", err);
  process.exit(1);
});
