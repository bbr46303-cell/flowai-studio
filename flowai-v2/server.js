const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/api/generate", (req, res) => {
  const { prompt, mode, ratio, duration } = req.body;

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({
      success: false,
      message: "Prompt is required."
    });
  }

  res.json({
    success: true,
    message: `${mode || "Video"} request received successfully.`,
    data: {
      prompt: prompt.trim(),
      mode: mode || "Video",
      ratio: ratio || "16:9",
      duration: duration || 10
    }
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`FlowAI Studio running on port ${PORT}`);
});
