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

app.use(express.json({ limit: "12mb" }));

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "public")));


/* =========================
   GENERATED FILES
========================= */

const generatedDir = path.join(__dirname, "generated");

if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true });
}

app.use("/generated", express.static(generatedDir));


/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
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
   SAVE GENERATED FILE
========================= */

async function saveBlob(blob, extension) {

  const id =
    Date.now() +
    "-" +
    Math.random().toString(36).substring(2, 10);

  const filename = `${id}.${extension}`;

  const filepath =
    path.join(generatedDir, filename);

  const buffer =
    Buffer.from(await blob.arrayBuffer());

  fs.writeFileSync(filepath, buffer);

  return `/generated/${filename}`;
}


/* =========================
   IMAGE GENERATION
========================= */

async function generateImage(prompt) {

  if (!hf) {
    throw new Error(
      "HF_TOKEN is not configured."
    );
  }

  const imageBlob = await hf.textToImage({
    model:
      "black-forest-labs/FLUX.1-Krea-dev",
    provider: "fal-ai",
    inputs: prompt,

    parameters: {
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

async function generateTextVideo(prompt) {

  if (!hf) {
    throw new Error(
      "HF_TOKEN is not configured."
    );
  }

  const videoBlob = await hf.textToVideo({
    model:
      "Wan-AI/Wan2.2-TI2V-5B",

    provider: "fal-ai",

    inputs: prompt
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
      "HF_TOKEN is not configured."
    );
  }

  if (!imageData) {
    throw new Error(
      "Please upload an image."
    );
  }


  /*
    Expected:

    data:image/jpeg;base64,...
    data:image/png;base64,...
    data:image/webp;base64,...
  */

  const match =
    imageData.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
    );

  if (!match) {
    throw new Error(
      "Invalid image format."
    );
  }

  const mimeType = match[1];
  const base64 = match[2];

  const imageBuffer =
    Buffer.from(base64, "base64");

  if (!imageBuffer.length) {
    throw new Error(
      "Uploaded image is empty."
    );
  }


  /*
    Convert uploaded image into Blob
    for Hugging Face image-to-video.
  */

  const imageBlob =
    new Blob(
      [imageBuffer],
      { type: mimeType }
    );


  /*
    Wan 2.2 Image-to-Video

    Current Hugging Face model:
    Wan-AI/Wan2.2-I2V-A14B

    Provider:
    fal-ai
  */

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
          "Cinematic natural motion, realistic camera movement, high detail"
      }
    });


  return await saveBlob(
    videoBlob,
    "mp4"
  );
}


/* =========================
   MAIN GENERATE API
========================= */

async function generateMedia(req, res) {

  const {
    prompt,
    mode,
    imageData
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


  const cleanPrompt =
    prompt.trim();


  try {

    console.log(
      "Generation:",
      mode,
      imageData
        ? "with reference image"
        : "text only"
    );


    /* =====================
       IMAGE
    ===================== */

    if (mode !== "video") {

      const url =
        await generateImage(
          cleanPrompt
        );

      return res.json({
        success: true,
        type: "image",
        url,
        prompt: cleanPrompt
      });
    }


    /* =====================
       VIDEO + IMAGE
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
        source: "image-to-video",
        url,
        prompt: cleanPrompt
      });
    }


    /* =====================
       TEXT → VIDEO
    ===================== */

    const url =
      await generateTextVideo(
        cleanPrompt
      );

    return res.json({
      success: true,
      type: "video",
      source: "text-to-video",
      url,
      prompt: cleanPrompt
    });


  } catch (error) {

    console.error(
      "GENERATION ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "AI generation failed."
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

app.listen(PORT, () => {

  console.log(
    `FlowAI Studio running on port ${PORT}`
  );

  console.log(
    `HF configured: ${Boolean(HF_TOKEN)}`
  );

});
