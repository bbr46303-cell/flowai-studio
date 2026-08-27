const express = require("express");
const cors = require("cors");
const path = require("path");
const Replicate = require("replicate");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/api/generate", async (req, res) => {

  try {

    const {
      prompt,
      mode,
      ratio,
      duration
    } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: "Prompt is required."
      });
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      return res.status(500).json({
        success: false,
        error: "REPLICATE_API_TOKEN is not configured on server."
      });
    }

    if (mode === "Audio") {
      return res.status(400).json({
        success: false,
        error: "Audio generation is not connected yet. Please select Video."
      });
    }

    const finalPrompt =
      `${prompt.trim()}, cinematic, high quality, realistic, detailed`;

    console.log("Generating video...");
    console.log("Prompt:", finalPrompt);
    console.log("Ratio:", ratio);
    console.log("Duration:", duration);

    const output = await replicate.run(
      "google/veo-2",
      {
        input: {
          prompt: finalPrompt
        }
      }
    );

    let videoUrl = null;

    if (output) {

      if (typeof output === "string") {
        videoUrl = output;
      }

      else if (output.url) {
        videoUrl = output.url();
      }

      else if (Array.isArray(output) && output.length > 0) {

        const first = output[0];

        if (typeof first === "string") {
          videoUrl = first;
        }

        else if (first && first.url) {
          videoUrl = first.url();
        }
      }
    }

    if (!videoUrl) {
      console.log("Replicate output:", output);

      return res.status(500).json({
        success: false,
        error: "Video generated but video URL was not returned."
      });
    }

    console.log("Video URL:", videoUrl);

    return res.json({
      success: true,
      message: "Video generated successfully!",
      videoUrl: videoUrl
    });

  } catch (error) {

    console.error("VIDEO GENERATION ERROR:", error);

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Video generation failed."
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`FlowAI Studio running on port ${PORT}`);
});
