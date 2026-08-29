import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Replicate from "replicate";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;

const REPLICATE_API_TOKEN =
  process.env.REPLICATE_API_TOKEN;

const replicate = REPLICATE_API_TOKEN
  ? new Replicate({
      auth: REPLICATE_API_TOKEN
    })
  : null;


/* =========================
   BASIC SETUP
========================= */

app.use(
  express.json({
    limit: "15mb"
  })
);

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
  express.static(__dirname)
);

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


/* =========================
   GENERATED
========================= */

const generatedDir =
  path.join(
    __dirname,
    "generated"
  );

if (
  !fs.existsSync(generatedDir)
) {

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
   HEALTH
========================= */

app.get(
  "/api/health",
  (req, res) => {

    res.json({

      success: true,

      service:
        "FlowAI Studio",

      provider:
        "Replicate",

      model:
        "wan-video/wan-2.2-t2v-fast",

      replicateConfigured:
        Boolean(
          REPLICATE_API_TOKEN
        )

    });

  }
);


/* =========================
   SAVE VIDEO
========================= */

async function saveVideo(
  video
) {

  if (!video) {

    throw new Error(
      "Replicate did not return a video."
    );

  }

  let videoUrl = null;

  /*
    Replicate FileOutput normally
    provides url()
  */

  if (
    typeof video.url ===
    "function"
  ) {

    videoUrl =
      video.url();

  }

  /*
    Some responses may already
    be strings or URL objects.
  */

  if (
    !videoUrl &&
    typeof video ===
      "string"
  ) {

    videoUrl =
      video;

  }

  if (!videoUrl) {

    throw new Error(
      "Unable to read generated video URL."
    );

  }

  console.log(
    "Downloading video:",
    videoUrl
  );


  const response =
    await fetch(
      videoUrl
    );

  if (!response.ok) {

    throw new Error(
      `Video download failed: HTTP ${response.status}`
    );

  }


  const buffer =
    Buffer.from(
      await response.arrayBuffer()
    );


  if (!buffer.length) {

    throw new Error(
      "Generated video is empty."
    );

  }


  const id =
    Date.now() +
    "-" +
    Math.random()
      .toString(36)
      .substring(2, 10);


  const filename =
    `${id}.mp4`;


  const filepath =
    path.join(
      generatedDir,
      filename
    );


  fs.writeFileSync(
    filepath,
    buffer
  );


  return `/generated/${filename}`;

}


/* =========================
   TEXT → VIDEO
========================= */

async function generateVideo(
  prompt
) {

  if (!replicate) {

    throw new Error(
      "REPLICATE_API_TOKEN is not configured on the server."
    );

  }


  const finalPrompt =
    `${prompt.trim()}. Cinematic video, smooth natural motion, realistic movement, realistic lighting, detailed visuals, professional camera movement, high quality.`;


  console.log(
    "FLOWAI → REPLICATE"
  );

  console.log({
    model:
      "wan-video/wan-2.2-t2v-fast",

    prompt:
      finalPrompt
  });


  const output =
    await replicate.run(
      "wan-video/wan-2.2-t2v-fast",
      {
        input: {
          prompt:
            finalPrompt
        }
      }
    );


  console.log(
    "Replicate generation completed."
  );


  return await saveVideo(
    output
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
    ratio
  } =
    req.body || {};


  if (
    !prompt ||
    typeof prompt !==
      "string" ||
    !prompt.trim()
  ) {

    return res.status(400).json({

      success: false,

      error:
        "Prompt is required."

    });

  }


  if (
    mode !==
    "video"
  ) {

    return res.status(400).json({

      success: false,

      error:
        "FlowAI currently supports Text to Video only."

    });

  }


  const cleanPrompt =
    prompt.trim();


  const selectedRatio =
    ratio === "9:16"
      ? "9:16"
      : "16:9";


  try {

    console.log(
      "================================"
    );

    console.log(
      "FLOWAI VIDEO REQUEST"
    );

    console.log({
      prompt:
        cleanPrompt,

      ratio:
        selectedRatio
    });

    console.log(
      "================================"
    );


    const url =
      await generateVideo(
        cleanPrompt
      );


    return res.json({

      success: true,

      type:
        "video",

      source:
        "replicate-wan-2.2",

      url,

      duration:
        5,

      ratio:
        selectedRatio,

      prompt:
        cleanPrompt

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
      lower.includes(
        "unauthorized"
      ) ||
      lower.includes(
        "401"
      ) ||
      lower.includes(
        "403"
      ) ||
      lower.includes(
        "authentication"
      )
    ) {

      message =
        "Replicate authentication failed. Please check REPLICATE_API_TOKEN in Render.";

    }


    if (
      lower.includes(
        "credit"
      ) ||
      lower.includes(
        "billing"
      ) ||
      lower.includes(
        "payment"
      ) ||
      lower.includes(
        "balance"
      )
    ) {

      message =
        "Replicate account requires available billing/credits for video generation.";

    }


    return res.status(500).json({

      success: false,

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
      `Replicate configured: ${Boolean(
        REPLICATE_API_TOKEN
      )}`
    );

  }
);
