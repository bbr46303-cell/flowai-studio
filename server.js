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
    hfConfigured: Boolean(HF_TOKEN)
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
   VIDEO
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
    Supported website durations:
    5 / 10 / 15 seconds

    The selected duration is included
    in the prompt because the selected
    provider/model may have its own
    native duration constraints.
  */

  const durationText =
    `${duration} second cinematic video`;

  let aspectText =
    "16:9 landscape";

  if (ratio === "9:16") {
    aspectText =
      "9:16 vertical portrait";
  }

  const finalPrompt =
    `${prompt}. ${durationText}, ${aspectText}, smooth natural motion, cinematic camera movement, realistic lighting, high detail.`;

  const videoBlob =
    await hf.textToVideo({

      model:
        "Wan-AI/Wan2.2-TI2V-5B",

      provider:
        "fal-ai",

      inputs:
        finalPrompt
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
  prompt
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
          "Cinematic natural movement, realistic camera motion, high detail."
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
      : 10;

  try {

    console.log(
      "FLOWAI GENERATION",
      {
        mode,
        ratio: selectedRatio,
        duration:
          selectedDuration
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

        type: "image",

        url,

        free: true,

        prompt: cleanPrompt,

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
          cleanPrompt
        );

      return res.json({

        success: true,

        type: "video",

        source:
          "image-to-video",

        url,

        duration:
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

        success: true,

        type: "video",

        source:
          "text-to-video",

        url,

        duration:
          selectedDuration,

        ratio:
          selectedRatio,

        prompt:
          cleanPrompt

      });
    }


    return res.status(400).json({

      success: false,

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

    return res.status(500).json({

      success: false,

      error: message

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
