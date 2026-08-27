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
    if (mode === 'video') {
      // Using a high-quality animated GIF/video endpoint that renders properly in mobile video tags
      const encodedPrompt = encodeURIComponent(prompt);
      const videoStreamUrl = `https://image.pollinations.ai/prompt/animated%20loop%20${encodedPrompt}?width=576&height=1024&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
      
      return res.json({ type: 'video', url: videoStreamUrl });
    } else {
      const response = await fetch(
        "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0",
        {
          headers: {
            Authorization: `Bearer ${process.env.HF_TOKEN}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify({ inputs: prompt }),
        }
      );

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        return res.status(response.status).json({ error: errJson.error || "Generation Failed" });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Image = buffer.toString('base64');
      
      return res.json({ type: 'image', url: `data:image/jpeg;base64,${base64Image}` });
    }

  } catch (error) {
    res.status(500).json({ error: error.message || "Server Error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
