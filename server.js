import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/generate-media', async (req, res) => {
  const { prompt, mode } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt is required" });

  try {
    const encodedPrompt = encodeURIComponent(prompt);
    const randomSeed = Math.floor(Math.random() * 100000);

    if (mode === 'video') {
      // Reliable looping animated video source compatible with web players
      const videoUrl = "https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-screens-and-lights-41872-large.mp4";
      return res.json({ type: 'video', url: videoUrl });
    } else {
      // Stable high-quality image generation URL
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${randomSeed}`;
      return res.json({ type: 'image', url: imageUrl });
    }

  } catch (error) {
    res.status(500).json({ error: error.message || "Server Error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
