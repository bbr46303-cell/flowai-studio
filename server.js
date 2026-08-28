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


/* =========================
   BASIC SETUP
========================= */

app.use(express.json({
  limit: "15mb"
}));

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

app.use(express.static(__dirname));

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
      service: "FlowAI Studio",
      falConfigured:
        Boolean(FAL_KEY),
      provider: "fal-ai",
      model:
        "fal-ai/wan/v2.2-5b/text-to-video"
    });

  }
);


/* =========================
   SAVE FAL VIDEO
========================= */

async function saveVideoFromUrl(
  videoUrl
) {

  if (!videoUrl) {
    throw new Error(
      "Fal did not return a video URL."
    );
  }

  const response =
    await fetch(videoUrl);

  if (!response.ok) {
    throw new Error(
      `Unable to download generated video. HTTP ${response.status}`
    );
  }

  const buffer =
    Buffer.from(
      await response.arrayBuffer()
    );

  if (!buffer.length) {
    throw new Error(
      "Generated video file is empty."
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
  prompt,
  ratio
) {

  if (!FAL_KEY) {
    throw new Error(
      "FAL_KEY is not configured on the server."
    );
  }

  const aspectRatio =
    ratio === "9:16"
      ? "9:16"
      : "16:9";

  const finalPrompt =
    `${prompt.trim()}. Cinematic video, smooth natural motion, realistic movement, realistic lighting, detailed visuals, professional camera movement.`;

  console.log(
    "FLOWAI → FAL VIDEO",
    {
      provider:
        "fal-ai",

      model:
        "fal-ai/wan/v2.2-5b/text-to-video",

      aspectRatio,

      duration:
        "5 seconds"
    }
  );


  const result =
    await fal.subscribe(
      "fal-ai/wan/v2.2-5b/text-to-video",
      {

        input: {

          prompt:
            finalPrompt,

          negative_prompt:
            "blurry, distorted, low quality, flickering, unnatural motion",

          num_frames:
            120,

          frames_per_second:
            24,

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

          guidance_scale:
            3.5,

          shift:
            5,

          interpolator_model:
            "none",

          video_quality:
            "high",

          video_write_mode:
            "balanced"
        },

        logs:
          true,

        onQueueUpdate:
          (update) => {

            if (
              update.status ===
              "IN_PROGRESS"
            ) {

              console.log(
                "Fal generation in progress..."
              );

              if (
                Array.isArray(
                  update.logs
                )
              ) {

                update.logs
                  .forEach(
                    (log) => {
                      console.log(
                        log.message
                      );
                    }
                  );

              }
            }
          }
      }
    );


  const videoUrl =
    result?.data?.video?.url;

  if (!videoUrl) {

    console.error(
      "Unexpected Fal response:",
      result
    );

    throw new Error(
      "Fal completed but no video URL was returned."
    );
  }

  return await saveVideoFromUrl(
    videoUrl
  );
}


/* =========================
   MAIN GENERATION API
========================= */

async function generateMedia(
  req,
  res
) {

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


  try {

    console.log(
      "FLOWAI GENERATION REQUEST",
      {
        mode,
        ratio:
          selectedRatio
      }
    );


    /* =====================
       ONLY TEXT → VIDEO
    ===================== */

    if (
      mode === "video"
    ) {

      const url =
        await generateVideo(
          cleanPrompt,
          selectedRatio
        );


      return res.json({

        success:
          true,

        type:
          "video",

        source:
          "fal-wan-2.2",

        url,

        duration:
          5,

        ratio:
          selectedRatio,

        prompt:
          cleanPrompt

      });

    }


    /* =====================
       IMAGE MODE
    ===================== */

    return res.status(400).json({

      success:
        false,

      error:
        "FlowAI currently supports Text to Video only."

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
      lower.includes("401") ||
      lower.includes("403") ||
      lower.includes(
        "invalid api key"
      )
    ) {

      message =
        "Fal API authentication failed. Please check FAL_KEY in Render Environment.";

    }


    if (
      lower.includes(
        "insufficient"
      ) ||
      lower.includes(
        "balance"
      ) ||
      lower.includes(
        "credit"
      )
    ) {

      message =
        "Fal account does not have enough balance/credits for this generation.";

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
      `Fal configured: ${Boolean(FAL_KEY)}`
    );

  }
);
