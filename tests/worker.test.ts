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
import { stopCleanupTask } from "../worker/src/storage/cleanup";

const TEST_SECRET = "test_worker_secret_123";
process.env.MEDIA_WORKER_SECRET = TEST_SECRET;
process.env.ALLOW_LOCAL_TEST_URLS = "true";

let testServer: http.Server | null = null;
let testMediaServer: http.Server | null = null;
let testMediaUrl = "";

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
  console.log("RUNNING CON 04 MEDIA WORKER INTEGRATION SUITE");
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

  // TEST 2: Input & Invalid Combination Validation Tests
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

  await test("Validation: Reject invalid combination video + mp3", async () => {
    const val = validateWorkerJobInput({
      url: testMediaUrl,
      mediaType: "video",
      format: "mp3",
      quality: "320k",
    });
    assert.strictEqual(val.isValid, false);
    assert.strictEqual(val.errorCode, "UNSUPPORTED_FORMAT");
  });

  await test("Validation: Reject invalid combination audio + mp4", async () => {
    const val = validateWorkerJobInput({
      url: testMediaUrl,
      mediaType: "audio",
      format: "mp4",
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

  // TEST 3: Video MP4 Quality Matrix (best, 1080p, 720p, 480p, 360p)
  const videoQualities = ["best", "1080p", "720p", "480p", "360p"];
  for (const q of videoQualities) {
    await test(`Real Processing: Video MP4 -> ${q}`, async () => {
      const res = await makeWorkerRequest(port, "POST", "/jobs", TEST_SECRET, {
        url: testMediaUrl,
        mediaType: "video",
        format: "mp4",
        quality: q,
      });
      assert.strictEqual(res.status, 201);
      const jobId = res.body.id;

      let completed = false;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 400));
        const poll = await makeWorkerRequest(port, "GET", `/jobs/${jobId}`, TEST_SECRET);
        if (poll.body.status === "COMPLETED") {
          completed = true;
          assert.strictEqual(poll.body.mimeType, "video/mp4");
          assert.ok(poll.body.downloadUrl);
          break;
        }
        if (poll.body.status === "FAILED") {
          assert.fail(`Job failed for Video MP4 ${q}: ${poll.body.error}`);
        }
      }
      assert.strictEqual(completed, true);
    });
  }

  // TEST 4: Audio MP3 Quality Matrix (best, 320k, 256k, 192k, 128k)
  const mp3Qualities = ["best", "320k", "256k", "192k", "128k"];
  for (const q of mp3Qualities) {
    await test(`Real Processing: Audio MP3 -> ${q}`, async () => {
      const res = await makeWorkerRequest(port, "POST", "/jobs", TEST_SECRET, {
        url: testMediaUrl,
        mediaType: "audio",
        format: "mp3",
        quality: q,
      });
      assert.strictEqual(res.status, 201);
      const jobId = res.body.id;

      let completed = false;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 400));
        const poll = await makeWorkerRequest(port, "GET", `/jobs/${jobId}`, TEST_SECRET);
        if (poll.body.status === "COMPLETED") {
          completed = true;
          assert.strictEqual(poll.body.mimeType, "audio/mpeg");
          assert.ok(poll.body.downloadUrl);
          break;
        }
        if (poll.body.status === "FAILED") {
          assert.fail(`Job failed for Audio MP3 ${q}: ${poll.body.error}`);
        }
      }
      assert.strictEqual(completed, true);
    });
  }

  // TEST 5: Audio M4A Quality Matrix (best, 256k, 192k, 128k)
  const m4aQualities = ["best", "256k", "192k", "128k"];
  for (const q of m4aQualities) {
    await test(`Real Processing: Audio M4A -> ${q}`, async () => {
      const res = await makeWorkerRequest(port, "POST", "/jobs", TEST_SECRET, {
        url: testMediaUrl,
        mediaType: "audio",
        format: "m4a",
        quality: q,
      });
      assert.strictEqual(res.status, 201);
      const jobId = res.body.id;

      let completed = false;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 400));
        const poll = await makeWorkerRequest(port, "GET", `/jobs/${jobId}`, TEST_SECRET);
        if (poll.body.status === "COMPLETED") {
          completed = true;
          assert.strictEqual(poll.body.mimeType, "audio/mp4");
          assert.ok(poll.body.downloadUrl);
          break;
        }
        if (poll.body.status === "FAILED") {
          assert.fail(`Job failed for Audio M4A ${q}: ${poll.body.error}`);
        }
      }
      assert.strictEqual(completed, true);
    });
  }

  // TEST 6: Download Token Validation & Binary Streaming
  await test("Download Token: Stream binary file via token", async () => {
    const sampleFile = generateTestMediaFile();
    const tokenRec = createDownloadToken("test_job_1", sampleFile, "mediaflow_test.mp4", "video/mp4");

    const dlRes = await makeWorkerRequest(port, "GET", `/download/${tokenRec.token}`, TEST_SECRET);
    assert.strictEqual(dlRes.status, 200);
    assert.strictEqual(dlRes.headers["content-type"], "video/mp4");
  });

  // TEST 7: Expired Token Rejection
  await test("Download Token: Reject expired or invalid token with 410", async () => {
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

  // ==================================================
  // CON 05 SOURCE ACQUISITION TEST SUITE
  // ==================================================
  const {
    defaultSourceAcquirer,
    detectYtDlpPath,
    getYtDlpVersion,
    selectVideoFormatAndQuality,
  } = await import("../worker/src/media/sourceAcquirer");
  const { sanitizeDownloadFilename } = await import("../worker/src/jobs/processJob");

  await test("CON 05: Binary Detection: yt-dlp binary is detected", async () => {
    const binPath = detectYtDlpPath();
    const binVersion = getYtDlpVersion();
    assert.ok(binPath, "yt-dlp binary path should be detected");
    assert.ok(binVersion, "yt-dlp version string should be non-empty");
  });

  await test("CON 05: Quality Selection Policy: Exact match & no-upscaling fallback", async () => {
    const mockFormats = [
      { formatId: "1", ext: "mp4", height: 720 },
      { formatId: "2", ext: "mp4", height: 480 },
      { formatId: "3", ext: "mp4", height: 360 },
    ];
    // 1. Requested 1080p when max available is 720p -> actualQuality 720p
    const res1080 = selectVideoFormatAndQuality(mockFormats, "1080p");
    assert.strictEqual(res1080.actualQuality, "720p");

    // 2. Requested 480p when 480p exists -> exact match 480p
    const res480 = selectVideoFormatAndQuality(mockFormats, "480p");
    assert.strictEqual(res480.actualQuality, "480p");

    // 3. Requested best -> max available 720p
    const resBest = selectVideoFormatAndQuality(mockFormats, "best");
    assert.strictEqual(resBest.actualQuality, "720p");
  });

  await test("CON 05: Filename Sanitization: Strip invalid characters and path escapes", async () => {
    const safeName = sanitizeDownloadFilename("Test / Video : Title * ? \" < > |", "job123", "mp4");
    assert.strictEqual(safeName, "Test _ Video _ Title _ _ _ _ _ _.mp4");

    const traversalName = sanitizeDownloadFilename("../../../etc/passwd", "job123", "mp4");
    assert.strictEqual(traversalName.includes("/"), false);
    assert.strictEqual(traversalName.includes("\\"), false);
  });

  await test("CON 05: YouTube Metadata & Format Discovery via SourceAcquirer", async () => {
    const meta = await defaultSourceAcquirer.analyzeSource("https://www.youtube.com/watch?v=jNQXAC9IVRw");
    assert.strictEqual(meta.sourceType, "youtube");
    assert.strictEqual(meta.id, "jNQXAC9IVRw");
    assert.ok(meta.title);
    assert.ok(meta.availableFormats && meta.availableFormats.length > 0);
  });

  await test("CON 05: Real YouTube Source Acquisition -> MP4 Video Output", async () => {
    const res = await makeWorkerRequest(port, "POST", "/jobs", TEST_SECRET, {
      url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
      mediaType: "video",
      format: "mp4",
      quality: "360p",
    });
    assert.strictEqual(res.status, 201);
    const jobId = res.body.id;

    let completed = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const poll = await makeWorkerRequest(port, "GET", `/jobs/${jobId}`, TEST_SECRET);
      if (poll.body.status === "COMPLETED") {
        completed = true;
        assert.strictEqual(poll.body.mimeType, "video/mp4");
        assert.ok(poll.body.downloadUrl);
        assert.ok(poll.body.filename);
        break;
      }
      if (poll.body.status === "FAILED") {
        assert.fail(`YouTube MP4 acquisition job failed: ${poll.body.error}`);
      }
    }
    assert.strictEqual(completed, true);
  });

  await test("CON 05: Real YouTube Source Acquisition -> MP3 Audio Output", async () => {
    const res = await makeWorkerRequest(port, "POST", "/jobs", TEST_SECRET, {
      url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
      mediaType: "audio",
      format: "mp3",
      quality: "128k",
    });
    assert.strictEqual(res.status, 201);
    const jobId = res.body.id;

    let completed = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const poll = await makeWorkerRequest(port, "GET", `/jobs/${jobId}`, TEST_SECRET);
      if (poll.body.status === "COMPLETED") {
        completed = true;
        assert.strictEqual(poll.body.mimeType, "audio/mpeg");
        assert.ok(poll.body.downloadUrl);
        break;
      }
      if (poll.body.status === "FAILED") {
        assert.fail(`YouTube MP3 acquisition job failed: ${poll.body.error}`);
      }
    }
    assert.strictEqual(completed, true);
  });

  await test("CON 05: Instagram Unauthenticated Acquisition Handling", async () => {
    const igUrl = "https://www.instagram.com/reel/C-12345678/";
    try {
      const meta = await defaultSourceAcquirer.analyzeSource(igUrl);
      assert.ok(meta.id);
    } catch (err: any) {
      const code = err.errorCode || err.code;
      assert.ok(
        code === "SOURCE_UNAVAILABLE" ||
        code === "AUTHENTICATION_REQUIRED" ||
        code === "MEDIA_NOT_FOUND" ||
        code === "EXTRACTOR_ERROR",
        `Instagram error should be normalized application code, got: ${code}`
      );
    }
  });

  await test("CON 05: Non-existent YouTube video failure handling", async () => {
    try {
      await defaultSourceAcquirer.analyzeSource("https://www.youtube.com/watch?v=00000000000");
      assert.fail("Should have thrown for non-existent video");
    } catch (err: any) {
      assert.ok(
        err.errorCode === "MEDIA_NOT_FOUND" || err.errorCode === "SOURCE_UNAVAILABLE",
        `Expected MEDIA_NOT_FOUND or SOURCE_UNAVAILABLE, got ${err.errorCode}`
      );
    }
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
