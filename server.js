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
        error: "Only video generation is enabled."
      });
    }

    const token = process.env.REPLICATE_API_TOKEN;

    if (!token) {
      return res.status(500).json({
        error: "REPLICATE_API_TOKEN is not configured."
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
          "Content-Type": "application/json"
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

    console.log("Replicate:", JSON.stringify(data));

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.detail || data.error || "Replicate API error."
      });
    }

    return res.json({
      success: true,
      predictionId: data.id,
      status: data.status,
      videoUrl: null,
      predictionUrl: data.urls?.get || null
    });

  } catch (error) {
    console.error("GENERATION ERROR:", error);

    return res.status(500).json({
      error: error.message || "Video generation failed."
    });
  }
});


/* CHECK VIDEO STATUS */

app.get("/api/status/:id", async (req, res) => {
  try {
    const token = process.env.REPLICATE_API_TOKEN;

    if (!token) {
      return res.status(500).json({
        error: "REPLICATE_API_TOKEN is not configured."
      });
    }

    const response = await fetch(
      `https://api.replicate.com/v1/predictions/${req.params.id}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.detail || data.error || "Status check failed."
      });
    }

    let videoUrl = null;

    if (typeof data.output === "string") {
      videoUrl = data.output;
    }

    if (Array.isArray(data.output) && data.output.length > 0) {
      videoUrl = data.output[0];
    }

    return res.json({
      success: true,
      status: data.status,
      videoUrl: videoUrl,
      error: data.error || null
    });

  } catch (error) {
    console.error("STATUS ERROR:", error);

    return res.status(500).json({
      error: error.message || "Status check failed."
    });
  }
});


app.listen(PORT, "0.0.0.0", () => {
  console.log(`FlowAI Studio running on port ${PORT}`);
});
