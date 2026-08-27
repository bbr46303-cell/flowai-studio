const express = require("express");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static("."));

const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.post("/api/generate", async (req, res) => {
  try {
    const { prompt, mode, ratio, duration } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        error: "Prompt is required."
      });
    }

    if (mode !== "Video") {
      return res.status(400).json({
        error: "Only video generation is enabled right now."
      });
    }

    const token = process.env.REPLICATE_API_TOKEN;

    if (!token) {
      return res.status(500).json({
        error: "REPLICATE_API_TOKEN is not configured on Render."
      });
    }

    console.log("Generating video...");
    console.log("Prompt:", prompt);
    console.log("Ratio:", ratio);
    console.log("Duration:", duration);

    const response = await fetch(
      "https://api.replicate.com/v1/models/minimax/video-01/predictions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Prefer": "wait=60"
        },
        body: JSON.stringify({
          input: {
            prompt: prompt.trim(),
            prompt_optimizer: true
          }
        })
      }
    );

    const data = await response.json();

    console.log(
      "Replicate response:",
      JSON.stringify(data)
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data.detail ||
          data.error ||
          "Replicate API error."
      });
    }

    let videoUrl = null;

    if (typeof data.output === "string") {
      videoUrl = data.output;
    } else if (
      Array.isArray(data.output) &&
      data.output.length > 0
    ) {
      videoUrl = data.output[0];
    }

    if (videoUrl) {
      return res.json({
        success: true,
        status: data.status,
        videoUrl: videoUrl,
        predictionId: data.id
      });
    }

    return res.json({
      success: true,
      status: data.status,
      predictionId: data.id,
      message: "Video is still processing.",
      predictionUrl:
        data.urls && data.urls.web
          ? data.urls.web
          : null
    });

  } catch (error) {
    console.error(
      "GENERATION ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Video generation failed."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `FlowAI Studio running on port ${PORT}`
  );
});
