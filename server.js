import express from "express";
import Replicate from "replicate";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// 1. Video Start Route
app.post("/api/generate-video", async (req, res) => {
  try {
    const { prompt } = req.body;
    const prediction = await replicate.predictions.create({
      model: "minimax/video-01",
      input: { prompt }
    });
    res.json({ id: prediction.id, status: prediction.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Status Check Route
app.get("/api/video-status/:id", async (req, res) => {
  try {
    const prediction = await replicate.predictions.get(req.params.id);
    res.json(prediction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

