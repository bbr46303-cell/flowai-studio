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

  res.header(
    "Access-Control-Allow-Origin",
    "*"
  );

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


app.use(
  express.json({
    limit: "20mb"
  })
);


/* =========================
   STATIC FILES
========================= */

app.use(
  express.static(__dirname)
);

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


/* =========================
   GENERATED FILES
========================= */

const generatedDir =
  path.join(
    __dirname,
    "generated"
  );


if (!fs.existsSync(generatedDir)) {

  fs.mkdirSync(
    generatedDir,
    {
      recursive: true
    }
  );

}


app.use(
  "/generated",
  express.static(generatedDir)
);


/* =========================
   HOME
========================= */

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );

  }
);


/* =========================
   LOGIN PAGE
========================= */

app.get(
  "/login",
  (req, res) => {

    const loginPath =
      path.join(
        __dirname,
        "login.html"
      );

    if (fs.existsSync(loginPath)) {

      return res.sendFile(
        loginPath
      );

    }

    res.redirect("/");

  }
);


/* =========================
   HEALTH
========================= */

app.get(
  "/api/health",
  (req, res) => {

    res.json({

      success: true,

      service:
        "FlowAI Studio",

      hfConfigured:
        Boolean(HF_TOKEN),

      image:
        "FREE",

      videoDurations:
        [5, 10, 15]

    });

  }
);


/* =========================
   SAVE BLOB
========================= */

async function saveBlob(
  blob,
  extension
) {

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
   IMAGE GENERATION
   FREE / UNLIMITED
========================= */

async function generateImage(
  prompt,
  aspect
) {

  if (!hf) {

    throw new Error(
      "HF_TOKEN is not configured on Render."
    );

  }


  console.log(
    "IMAGE GENERATION:",
    {
      prompt,
      aspect
    }
  );


  const imageBlob =
    await hf.textToImage({

      model:
        "black-forest-labs/FLUX.1-Krea-dev",

      provider:
        "fal-ai",

      inputs:
        prompt,

      parameters: {

        num_inference_steps:
          28

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

async function generateTextVideo(
  prompt,
  duration,
  aspect
) {

  if (!hf) {

    throw new Error(
      "HF_TOKEN is not configured on Render."
    );

  }


  console.log(
    "VIDEO GENERATION:",
    {
      prompt,
      duration,
      aspect
    }
  );


  /*
    Wan2.2 TI2V

    NOTE:
    The exact supported duration /
    resolution parameters depend on
    the selected provider/model.

    We send the requested duration
    when supported by the provider.
  */


  const parameters = {};


  /*
    16:9 / 9:16

    These values are kept available
    for the provider/backend.
  */

  if (aspect === "9:16") {

    parameters.aspect_ratio =
      "9:16";

  } else {

    parameters.aspect_ratio =
      "16:9";

  }


  /*
    Requested duration.
  */

  parameters.duration =
    duration;


  const videoBlob =
    await hf.textToVideo({

      model:
        "Wan-AI/Wan2.2-TI2V-5B",

      provider:
        "fal-ai",

      inputs:
        prompt,

      parameters:
        parameters

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
  duration,
  aspect
) {

  if (!hf) {

    throw new Error(
      "HF_TOKEN is not configured on Render."
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
        type:
          mimeType
      }
    );


  const parameters = {

    prompt:
      prompt ||
      "Cinematic natural motion, realistic camera movement, high detail",

    duration:
      duration,

    aspect_ratio:
      aspect === "9:16"
        ? "9:16"
        : "16:9"

  };


  console.log(
    "IMAGE TO VIDEO:",
    {
      duration,
      aspect
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

      parameters:
        parameters

    });


  return await saveBlob(
    videoBlob,
    "mp4"
  );

}


/* =========================
   MAIN GENERATE API
========================= */

async function generateMedia(
  req,
  res
) {

  const {

    prompt,

    mode,

    imageData,

    aspect,

    duration

  } =
    req.body || {};


  /* =====================
     PROMPT CHECK
  ===================== */

  if (
    !prompt ||
    typeof prompt !== "string" ||
    !prompt.trim()
  ) {

    return res.status(400).json({

      success:
        false,

      error:
        "Prompt is required."

    });

  }


  const cleanPrompt =
    prompt.trim();


  /* =====================
     MODE
  ===================== */

  const cleanMode =
    mode === "video"
      ? "video"
      : "image";


  /* =====================
     ASPECT
  ===================== */

  const cleanAspect =
    aspect === "9:16"
      ? "9:16"
      : "16:9";


  /* =====================
     DURATION
  ===================== */

  let cleanDuration =
    Number(duration || 10);


  if (
    ![5, 10, 15]
      .includes(cleanDuration)
  ) {

    cleanDuration =
      10;

  }


  console.log(
    "=========================="
  );

  console.log(
    "FLOWAI GENERATION"
  );

  console.log(
    "Mode:",
    cleanMode
  );

  console.log(
    "Aspect:",
    cleanAspect
  );

  console.log(
    "Duration:",
    cleanDuration
  );

  console.log(
    "=========================="
  );


  try {


    /* =====================
       IMAGE
       FREE
    ===================== */

    if (
      cleanMode === "image"
    ) {

      const url =
        await generateImage(
          cleanPrompt,
          cleanAspect
        );


      return res.json({

        success:
          true,

        type:
          "image",

        url:
          url,

        creditsUsed:
          0,

        prompt:
          cleanPrompt,

        aspect:
          cleanAspect

      });

    }


    /* =====================
       VIDEO
       IMAGE → VIDEO
    ===================== */

    if (
      cleanMode === "video" &&
      imageData
    ) {

      const url =
        await generateImageVideo(
          imageData,
          cleanPrompt,
          cleanDuration,
          cleanAspect
        );


      return res.json({

        success:
          true,

        type:
          "video",

        source:
          "image-to-video",

        url:
          url,

        creditsUsed:
          cleanDuration === 5
            ? 5
            : cleanDuration === 10
            ? 10
            : 15,

        duration:
          cleanDuration,

        aspect:
          cleanAspect,

        prompt:
          cleanPrompt

      });

    }


    /* =====================
       TEXT → VIDEO
    ===================== */

    const url =
      await generateTextVideo(
        cleanPrompt,
        cleanDuration,
        cleanAspect
      );


    return res.json({

      success:
        true,

      type:
        "video",

      source:
        "text-to-video",

      url:
        url,

      creditsUsed:
        cleanDuration === 5
          ? 5
          : cleanDuration === 10
          ? 10
          : 15,

      duration:
        cleanDuration,

      aspect:
        cleanAspect,

      prompt:
        cleanPrompt

    });


  } catch (error) {

    console.error(
      "=========================="
    );

    console.error(
      "GENERATION ERROR"
    );

    console.error(
      error
    );

    console.error(
      "=========================="
    );


    return res.status(500).json({

      success:
        false,

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
   START SERVER
========================= */

app.listen(
  PORT,
  () => {

    console.log(
      "================================"
    );

    console.log(
      `FlowAI Studio running on port ${PORT}`
    );

    console.log(
      `HF configured: ${Boolean(HF_TOKEN)}`
    );

    console.log(
      "Image: FREE / Unlimited"
    );

    console.log(
      "Video: 5s = 5 credits"
    );

    console.log(
      "Video: 10s = 10 credits"
    );

    console.log(
      "Video: 15s = 15 credits"
    );

    console.log(
      "================================"
    );

  }
);
