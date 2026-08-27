import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  );
  res.header(
    'Access-Control-Allow-Methods',
    'GET, POST, OPTIONS'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

app.use(express.json({ limit: '2mb' }));

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


/* ================================
   AI GENERATE API
================================ */

async function generateMedia(req, res) {

  const { prompt, mode } = req.body || {};

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({
      error: 'Prompt is required'
    });
  }

  try {

    const cleanPrompt = prompt.trim();

    const encodedPrompt =
      encodeURIComponent(cleanPrompt);

    const randomSeed =
      Math.floor(Math.random() * 1000000);


    /* ================================
       IMAGE MODE
    ================================= */

    if (mode !== 'video') {

      const imageUrl =
        `https://image.pollinations.ai/prompt/${encodedPrompt}` +
        `?width=1024` +
        `&height=1024` +
        `&nologo=true` +
        `&seed=${randomSeed}`;

      return res.json({
        success: true,
        type: 'image',
        url: imageUrl,
        prompt: cleanPrompt
      });
    }


    /* ================================
       VIDEO MODE
       
       Temporary video-compatible response.
       Real AI video generation will be
       connected separately.
    ================================= */

    const videoUrl =
      `https://image.pollinations.ai/prompt/` +
      `${encodeURIComponent(
        'cinematic motion scene ' + cleanPrompt
      )}` +
      `?width=576` +
      `&height=1024` +
      `&nologo=true` +
      `&seed=${randomSeed}`;

    return res.json({
      success: true,
      type: 'video',
      url: videoUrl,
      prompt: cleanPrompt
    });

  } catch (error) {

    console.error('Generation error:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Generation failed'
    });
  }
}


/* =================================
   BOTH API ROUTES

   Frontend currently uses:
   /api/generate

   Old route:
   /generate-media
================================= */

app.post('/api/generate', generateMedia);

app.post('/generate-media', generateMedia);


/* =================================
   HEALTH CHECK
================================= */

app.get('/api/health', (req, res) => {

  res.json({
    success: true,
    message: 'FlowAI Studio backend is running'
  });

});


/* =================================
   START SERVER
================================= */

app.listen(PORT, () => {

  console.log(
    `FlowAI Studio server running on port ${PORT}`
  );

});
