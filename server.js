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

if (!HF_TOKEN) {
  console.warn("WARNING: HF_TOKEN is not configured.");
}

const hf = HF_TOKEN
  ? new InferenceClient(HF_TOKEN)
  : null;


/* =========================================
   BASIC SETUP
========================================= */

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

app.use(express.json({ limit: "10mb" }));

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "public")));


/* =========================================
   GENERATED MEDIA STORAGE
========================================= */

const generatedDir = path.join(__dirname, "generated");

if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true });
}

app.use(
  "/generated",
  express.static(generatedDir, {
    maxAge: "1h"
  })
);


/* =========================================
   HOME
========================================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});


/* =========================================
   HEALTH CHECK
========================================= */

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "FlowAI Studio",
    hfConfigured: Boolean(HF_TOKEN)
  });
});


/* =========================================
   SAVE BLOB TO SERVER
========================================= */

async function saveBlob(blob, extension) {

  const id =
    Date.now() +
    "-" +
    Math.random().toString(36).slice(2, 10);

  const filename = `${id}.${extension}`;

  const filepath = path.join(
    generatedDir,
    filename
  );

  const buffer = Buffer.from(
    await blob.arrayBuffer()
  );

  fs.writeFileSync(filepath, buffer);

  return `/generated/${filename}`;
}


/* =========================================
   IMAGE GENERATION
========================================= */

async function generateImage(prompt) {

  if (!hf) {
    throw new Error(
      "HF_TOKEN is not configured on Render."
    );
  }

  /*
    Current HF Inference Providers model.
    Provider is automatically selected.
  */

  const imageBlob = await hf.textToImage({
    model: "black-forest-labs/FLUX.1-Krea-dev",
    inputs: prompt,
    parameters: {
      num_inference_steps: 28
    }
  });

  const mime =
    imageBlob.type || "image/png";

  const extension =
    mime.includes("jpeg")
      ? "jpg"
      : "png";

  const url = await saveBlob(
    imageBlob,
    extension
  );

  return url;
}


/* =========================================
   VIDEO GENERATION
========================================= */

async function generateVideo(prompt) {

  if (!hf) {
    throw new Error(
      "HF_TOKEN is not configured on Render."
    );
  }

  /*
    Primary model:
    Wan 2.2 text/image-to-video model.

    Hugging Face Inference Providers
    handles the provider routing.
  */

  const videoBlob = await hf.textToVideo({
    model: "Wan-AI/Wan2.2-TI2V-5B",
    inputs: prompt
  });

  const url = await saveBlob(
    videoBlob,
    "mp4"
  );

  return url;
}


/* =========================================
   MAIN GENERATION API
========================================= */

async function generateMedia(req, res) {

  const { prompt, mode } = req.body || {};

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

  const cleanPrompt = prompt.trim();

  try {

    console.log(
      `Generation started: ${mode || "image"}`
    );

    console.log(
      `Prompt: ${cleanPrompt}`
    );


    /* =====================================
       VIDEO
    ===================================== */

    if (mode === "video") {

      const videoUrl =
        await generateVideo(cleanPrompt);

      console.log(
        "Video generation completed."
      );

      return res.json({
        success: true,
        type: "video",
        url: videoUrl,
        prompt: cleanPrompt
      });
    }


    /* =====================================
       IMAGE
    ===================================== */

    const imageUrl =
      await generateImage(cleanPrompt);

    console.log(
      "Image generation completed."
    );

    return res.json({
      success: true,
      type: "image",
      url: imageUrl,
      prompt: cleanPrompt
    });


  } catch (error) {

    console.error(
      "AI GENERATION ERROR:",
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


/* =========================================
   API ROUTES
========================================= */

app.post(
  "/api/generate",
  generateMedia
);

app.post(
  "/generate-media",
  generateMedia
);


/* =========================================
   SIMPLE TEST
========================================= */

app.get("/api/test", (req, res) => {

  res.json({
    success: true,
    message: "FlowAI Studio API is working."
  });

});


/* =========================================
   CLEAN OLD GENERATED FILES
========================================= */

setInterval(() => {

  try {

    const files =
      fs.readdirSync(generatedDir);

    const now = Date.now();

    for (const file of files) {

      const filepath =
        path.join(generatedDir, file);

      const stats =
        fs.statSync(filepath);

      const age =
        now - stats.mtimeMs;

      /*
        Delete files older than 1 hour.
      */

      if (age > 60 * 60 * 1000) {

        fs.unlinkSync(filepath);

        console.log(
          "Deleted old generated file:",
          file
        );
      }
    }

  } catch (error) {

    console.error(
      "Cleanup error:",
      error.message
    );

  }

}, 15 * 60 * 1000);


/* =========================================
   START SERVER
========================================= */

app.listen(PORT, () => {

  console.log(
    `FlowAI Studio running on port ${PORT}`
  );

  console.log(
    `HF configured: ${Boolean(HF_TOKEN)}`
  );

});
