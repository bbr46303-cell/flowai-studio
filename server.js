import express from "express";
import Replicate from "replicate";

const app = express();
app.use(express.json());

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// 👇 IN DONO ROUTES KO YAHAN PASTE KAREIN 👇

// 1. Video Start Karne Ka Route
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

// 2. Status Check Karne Ka Route
app.get("/api/video-status/:id", async (req, res) => {
  try {
    const prediction = await replicate.predictions.get(req.params.id);
    res.json(prediction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 👆 --------------------------------- 👆

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
