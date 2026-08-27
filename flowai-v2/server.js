const express = require("express");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static("."));

const PORT = process.env.PORT || 3000;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.post("/api/generate-video", async (req, res) => {
  try {
    if (!REPLICATE_API_TOKEN) {
      return res.status(500).json({
        error: "REPLICATE_API_TOKEN is missing on Render."
      });
    }

    const { prompt, aspectRatio = "16:9", duration = 5 } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        error: "Prompt is required."
      });
    }

    const response = await fetch(
      "https://api.replicate.com/v1/models/wavespeedai/wan-2.1-t2v-720p/predictions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${REPLICATE_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          input: {
            prompt: prompt.trim(),
            aspect_ratio: aspectRatio,
            duration: Number(duration)
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Replicate error:", data);

      return res.status(response.status).json({
        error: data.detail || data.error || "Replicate request failed"
      });
    }

    res.json({
      success: true,
      id: data.id,
      status: data.status
    });

  } catch (error) {
    console.error("Generate error:", error);

    res.status(500).json({
      error: error.message
    });
  }
});

app.get("/api/video-status/:id", async (req, res) => {
  try {
    const response = await fetch(
      `https://api.replicate.com/v1/predictions/${req.params.id}`,
      {
        headers: {
          "Authorization": `Bearer ${REPLICATE_API_TOKEN}`
        }
      }
    );

    const data = await response.json();

    res.json({
      status: data.status,
      output: data.output || null,
      error: data.error || null
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
