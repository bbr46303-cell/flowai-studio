import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { InferenceClient } from "@huggingface/inference";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const HF_TOKEN = process.env.HF_TOKEN;

const hf = HF_TOKEN
  ? new InferenceClient(HF_TOKEN)
  : null;


/* =========================
   BASIC SETUP
========================= */

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


/* =========================
   GENERATED FILES
========================= */

const generatedDir = path.join(
  __dirname,
  "generated"
);

if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, {
    recursive: true
  });
}

app.use(
  "/generated",
  express.static(generatedDir)
);


/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});


/* =========================
   HEALTH
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "FlowAI Studio",
    hfConfigured: Boolean(HF_TOKEN),
    videoProvider: "fal-ai",
    videoModel: "Wan-AI/Wan2.2-TI2V-5B"
  });
});


/* =========================
   SAVE FILE
========================= */

async function saveBlob(blob, extension) {

  const id =
    Date.now() +
    "-" +
    Math.random()
      .toString(36)
      .substring(2, 10);

  const filename =
    `${id}.${extension}`;

  const filepath =
    path.join(
      generatedDir,
      filename
    );

  const buffer =
    Buffer.from(
      await blob.arrayBuffer()
    );

  fs.writeFileSync(
    filepath,
    buffer
  );

  return `/generated/${filename}`;
}


/* =========================
   IMAGE
========================= */

async function generateImage(
  prompt,
  ratio
) {

  if (!hf) {
    throw new Error(
      "HF_TOKEN is not configured on the server."
    );
  }

  let width = 1024;
  let height = 576;

  if (ratio === "9:16") {
    width = 576;
    height = 1024;
  }

  const imageBlob =
    await hf.textToImage({

      model:
        "black-forest-labs/FLUX.1-Krea-dev",

      provider:
        "fal-ai",

      inputs:
        prompt,

      parameters: {
        width,
        height,
        num_inference_steps: 28
      }
    });

  return await saveBlob(
    imageBlob,
    "png"
  );
}


/* =========================
   TEXT → VIDEO
========================= */

async function generateVideo(
  prompt,
  ratio,
  duration
) {

  if (!hf) {
    throw new Error(
      "HF_TOKEN is not configured on the server."
    );
  }

  /*
    Wan 2.2 5B / Fal currently supports
    up to approximately 5 seconds.

    24 FPS × 120 frames = 5 seconds.
  */

  const framesPerSecond = 24;
  const numFrames = 120;

  const aspectRatio =
    ratio === "9:16"
      ? "9:16"
      : "16:9";

  const finalPrompt =
    `${prompt.trim()}. Cinematic video, smooth natural motion, realistic movement, realistic lighting, high detail, professional camera movement.`;

  console.log(
    "FLOWAI TEXT TO VIDEO",
    {
      model:
        "Wan-AI/Wan2.2-TI2V-5B",

      provider:
        "fal-ai",

      requestedDuration:
        duration,

      actualDuration:
        "5 seconds",

      numFrames,

      framesPerSecond,

      aspectRatio
    }
  );

  const videoBlob =
    await hf.textToVideo({

      model:
        "Wan-AI/Wan2.2-TI2V-5B",

      provider:
        "fal-ai",

      inputs:
        finalPrompt,

      parameters: {

        num_frames:
          numFrames,

        frames_per_second:
          framesPerSecond,

        resolution:
          "720p",

        aspect_ratio:
          aspectRatio,

        num_inference_steps:
          40,

        enable_safety_checker:
          true,

        enable_output_safety_checker:
          true,

        enable_prompt_expansion:
          false,

        video_write_mode:
          "balanced"
      }
    });

  return await saveBlob(
    videoBlob,
    "mp4"
  );
}


/* =========================
   IMAGE → VIDEO
========================= */

async function generateImageVideo(
  imageData,
  prompt,
  ratio
) {

  if (!hf) {
    throw new Error(
      "HF_TOKEN is not configured on the server."
    );
  }

  if (!imageData) {
    throw new Error(
      "Please upload an image."
    );
  }

  const match =
    imageData.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
    );

  if (!match) {
    throw new Error(
      "Invalid image format."
    );
  }

  const mimeType =
    match[1];

  const base64 =
    match[2];

  const imageBuffer =
    Buffer.from(
      base64,
      "base64"
    );

  if (!imageBuffer.length) {
    throw new Error(
      "Uploaded image is empty."
    );
  }

  const imageBlob =
    new Blob(
      [imageBuffer],
      {
        type: mimeType
      }
    );

  const aspectRatio =
    ratio === "9:16"
      ? "9:16"
      : "16:9";

  console.log(
    "FLOWAI IMAGE TO VIDEO",
    {
      model:
        "Wan-AI/Wan2.2-I2V-A14B",

      provider:
        "fal-ai",

      aspectRatio
    }
  );

  const videoBlob =
    await hf.imageToVideo({

      model:
        "Wan-AI/Wan2.2-I2V-A14B",

      provider:
        "fal-ai",

      inputs:
        imageBlob,

      parameters: {

        prompt:
          prompt ||
          "Cinematic natural movement, realistic camera motion, smooth motion, high detail.",

        num_frames:
          120,

        frames_per_second:
          24,

        aspect_ratio:
          aspectRatio,

        resolution:
          "720p",

        num_inference_steps:
          27,

        enable_safety_checker:
          true,

        enable_output_safety_checker:
          true
      }
    });

  return await saveBlob(
    videoBlob,
    "mp4"
  );
}


/* =========================
   MAIN API
========================= */

async function generateMedia(
  req,
  res
) {

  const {
    prompt,
    mode,
    ratio,
    duration,
    imageData
  } = req.body || {};

  if (
    !prompt ||
    typeof prompt !== "string" ||
    !prompt.trim()
  ) {

    return res.status(400).json({
      success: false,
      error:
        "Prompt is required."
    });
  }

  const cleanPrompt =
    prompt.trim();

  const selectedRatio =
    ratio === "9:16"
      ? "9:16"
      : "16:9";

  const selectedDuration =
    [5, 10, 15].includes(
      Number(duration)
    )
      ? Number(duration)
      : 5;

  try {

    console.log(
      "FLOWAI GENERATION",
      {
        mode,
        ratio:
          selectedRatio,
        duration:
          selectedDuration,
        hasImage:
          Boolean(imageData)
      }
    );


    /* =====================
       IMAGE
    ===================== */

    if (mode === "image") {

      const url =
        await generateImage(
          cleanPrompt,
          selectedRatio
        );

      return res.json({

        success: true,

        type:
          "image",

        url,

        free:
          true,

        prompt:
          cleanPrompt,

        ratio:
          selectedRatio

      });
    }


    /* =====================
       IMAGE → VIDEO
    ===================== */

    if (
      mode === "video" &&
      imageData
    ) {

      const url =
        await generateImageVideo(
          imageData,
          cleanPrompt,
          selectedRatio
        );

      return res.json({

        success:
          true,

        type:
          "video",

        source:
          "image-to-video",

        url,

        duration:
          5,

        requestedDuration:
          selectedDuration,

        ratio:
          selectedRatio,

        prompt:
          cleanPrompt

      });
    }


    /* =====================
       TEXT → VIDEO
    ===================== */

    if (mode === "video") {

      const url =
        await generateVideo(
          cleanPrompt,
          selectedRatio,
          selectedDuration
        );

      return res.json({

        success:
          true,

        type:
          "video",

        source:
          "text-to-video",

        url,

        duration:
          5,

        requestedDuration:
          selectedDuration,

        ratio:
          selectedRatio,

        prompt:
          cleanPrompt

      });
    }


    return res.status(400).json({

      success:
        false,

      error:
        "Invalid generation mode."

    });


  } catch (error) {

    console.error(
      "FLOWAI GENERATION ERROR:",
      error
    );

    let message =
      error?.message ||
      "AI generation failed.";

    const lower =
      message.toLowerCase();

    if (
      lower.includes("depleted") ||
      lower.includes("monthly") ||
      lower.includes("credits")
    ) {

      message =
        "Hugging Face Inference Provider credits are exhausted. Please add provider credits or use a provider API key.";
    }

    if (
      lower.includes("unauthorized") ||
      lower.includes("401") ||
      lower.includes("403")
    ) {

      message =
        "Hugging Face authentication failed. Check that HF_TOKEN is valid and has Inference Providers permission.";
    }

    if (
      lower.includes("not found") ||
      lower.includes("404")
    ) {

      message =
        "The selected video model/provider is unavailable. Please check the Hugging Face Fal provider configuration.";
    }

    return res.status(500).json({

      success:
        false,

      error:
        message

    });
  }
}


/* =========================
   ROUTES
========================= */

app.post(
  "/api/generate",
  generateMedia
);

app.post(
  "/generate-media",
  generateMedia
);


/* =========================
   START
========================= */

app.listen(
  PORT,
  () => {

    console.log(
      `FlowAI Studio running on port ${PORT}`
    );

    console.log(
      `HF configured: ${Boolean(HF_TOKEN)}`
    );

  }
);
