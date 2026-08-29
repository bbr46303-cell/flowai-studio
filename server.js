import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { fal } from "@fal-ai/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const FAL_KEY = process.env.FAL_KEY;

if (FAL_KEY) {
  fal.config({
    credentials: FAL_KEY
  });
}

app.use(express.json({ limit: "15mb" }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "public")));

const generatedDir = path.join(__dirname, "generated");

if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true });
}

app.use("/generated", express.static(generatedDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "FlowAI Studio",
    provider: "fal-ai",
    model: "fal-ai/wan/v2.2-5b/text-to-video",
    falConfigured: Boolean(FAL_KEY)
  });
});

async function saveVideoFromUrl(videoUrl) {
  if (!videoUrl) {
    throw new Error("FAL did not return a video URL.");
  }

  const response = await fetch(videoUrl);

  if (!response.ok) {
    throw new Error(
      `Unable to download generated video. HTTP ${response.status}`
    );
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  if (!buffer.length) {
    throw new Error("Generated video file is empty.");
  }

  const filename =
    Date.now() +
    "-" +
    Math.random().toString(36).substring(2, 10) +
    ".mp4";

  const filepath = path.join(
    generatedDir,
    filename
  );

  fs.writeFileSync(filepath, buffer);

  return `/generated/${filename}`;
}

async function generateVideo(prompt, ratio) {
  if (!FAL_KEY) {
    throw new Error(
      "FAL_KEY is not configured on the server."
    );
  }

  const aspectRatio =
    ratio === "9:16" ? "9:16" : "16:9";

  const finalPrompt =
    `${prompt.trim()}. Cinematic video, smooth natural motion, realistic movement, realistic lighting, detailed visuals, professional camera movement, high quality.`;

  console.log("================================");
  console.log("FLOWAI → FAL");
  console.log({
    model:
      "fal-ai/wan/v2.2-5b/text-to-video",
    ratio: aspectRatio,
    prompt: finalPrompt
  });
  console.log("================================");

  const result = await fal.subscribe(
    "fal-ai/wan/v2.2-5b/text-to-video",
    {
      input: {
        prompt: finalPrompt,

        negative_prompt:
          "blurry, distorted, low quality, flickering, unnatural motion",

        num_frames: 121,

        frames_per_second: 24,

        resolution: "720p",

        aspect_ratio: aspectRatio,

        num_inference_steps: 27,

        enable_safety_checker: true,

        enable_output_safety_checker: true,

        guidance_scale: 3.5,

        shift: 5,

        interpolator_model: "none",

        video_quality: "high",

        video_write_mode: "balanced"
      },

      logs: true,

      onQueueUpdate(update) {
        console.log(
          "FAL QUEUE STATUS:",
          update.status
        );

        if (Array.isArray(update.logs)) {
          update.logs.forEach((log) => {
            console.log(log.message);
          });
        }
      }
    }
  );

  const videoUrl =
    result?.data?.video?.url;

  if (!videoUrl) {
    console.error(
      "Unexpected FAL response:",
      result
    );

    throw new Error(
      "FAL completed but no video URL was returned."
    );
  }

  return await saveVideoFromUrl(videoUrl);
}

async function generateMedia(req, res) {
  const {
    prompt,
    mode,
    ratio
  } = req.body || {};

  if (
    !prompt ||
    typeof prompt !== "string" ||
    !prompt.trim()
  ) {
    return res.status(400).json({
      success: false,
      error: "Prompt is required."
    });
  }

  if (mode !== "video") {
    return res.status(400).json({
      success: false,
      error:
        "FlowAI currently supports Text to Video only."
    });
  }

  const selectedRatio =
    ratio === "9:16" ? "9:16" : "16:9";

  try {
    const url = await generateVideo(
      prompt.trim(),
      selectedRatio
    );

    return res.json({
      success: true,
      type: "video",
      source: "fal-wan-2.2",
      url,
      duration: 5,
      ratio: selectedRatio,
      prompt: prompt.trim()
    });

  } catch (error) {
    console.error(
      "FLOWAI GENERATION ERROR:",
      error
    );

    let message =
      error?.message ||
      "Video generation failed.";

    const lower =
      message.toLowerCase();

    if (
      lower.includes("401") ||
      lower.includes("403") ||
      lower.includes("unauthorized") ||
      lower.includes("authentication") ||
      lower.includes("api key")
    ) {
      message =
        "FAL authentication failed. Please check FAL_KEY in Render Environment.";
    }

    return res.status(500).json({
      success: false,
      error: message
    });
  }
}

app.post(
  "/api/generate",
  generateMedia
);

app.post(
  "/generate-media",
  generateMedia
);

app.listen(PORT, () => {
  console.log(
    `FlowAI Studio running on port ${PORT}`
  );

  console.log(
    `FAL configured: ${Boolean(FAL_KEY)}`
  );
});
