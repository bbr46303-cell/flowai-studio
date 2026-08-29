import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { fal } from "@fal-ai/client";
import Razorpay from "razorpay";
import admin from "firebase-admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: "20mb" }));
app.use(express.static(__dirname));

const FAL_KEY = process.env.FAL_KEY || "";

if (FAL_KEY) {
  fal.config({ credentials: FAL_KEY });
}

let db = null;

try {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";

  if (raw) {
    const serviceAccount = JSON.parse(raw);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    db = admin.firestore();
    console.log("Firebase Admin connected");
  } else {
    console.log("FIREBASE_SERVICE_ACCOUNT is not configured");
  }
} catch (e) {
  console.error("Firebase Admin init error:", e.message);
}

const RP_ID = process.env.RAZORPAY_KEY_ID || "";
const RP_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

const razorpay =
  RP_ID && RP_SECRET
    ? new Razorpay({
        key_id: RP_ID,
        key_secret: RP_SECRET
      })
    : null;

const PLANS = {
  Basic: {
    amount: 99,
    credits: 150,
    days: 30
  },

  Pro: {
    amount: 299,
    credits: 600,
    days: 30
  },

  Premium: {
    amount: 599,
    credits: 1500,
    days: 30
  },

  Ultra: {
    amount: 899,
    credits: null,
    days: 365,
    unlimited: true
  }
};

const generatedDir = path.join(__dirname, "generated");

if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, {
    recursive: true
  });
}

app.use("/generated", express.static(generatedDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    falConfigured: Boolean(FAL_KEY),
    firebaseConfigured: Boolean(db),
    razorpayConfigured: Boolean(razorpay)
  });
});

async function auth(req, res, next) {
  try {
    if (!db) {
      return res.status(503).json({
        error:
          "Firebase Admin is not configured. Add FIREBASE_SERVICE_ACCOUNT in Render."
      });
    }

    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Login required."
      });
    }

    const token = header.slice(7);

    req.user = await admin.auth().verifyIdToken(token);

    next();
  } catch (e) {
    console.error("Auth error:", e.message);

    res.status(401).json({
      error: "Login session invalid or expired."
    });
  }
}

async function userDoc(uid) {
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    const data = {
      credits: 50,
      unlimited: false,
      plan: "Free",
      planExpiresAt: null,
      createdAt:
        admin.firestore.FieldValue.serverTimestamp()
    };

    await ref.set(data);

    return {
      credits: 50,
      unlimited: false,
      plan: "Free",
      planExpiresAt: null
    };
  }

  return snap.data();
}

async function saveVideo(url) {
  if (!url) {
    throw new Error("Generated video URL is missing.");
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      "Unable to download generated video."
    );
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  if (!buffer.length) {
    throw new Error("Generated video is empty.");
  }

  const filename =
    `${Date.now()}-` +
    `${crypto.randomBytes(5).toString("hex")}.mp4`;

  fs.writeFileSync(
    path.join(generatedDir, filename),
    buffer
  );

  return `/generated/${filename}`;
}

async function makeVideo(prompt, ratio, duration) {
  if (!FAL_KEY) {
    throw new Error(
      "FAL_KEY is not configured on the server."
    );
  }

  const framesMap = {
    5: 121,
    10: 241,
    15: 361
  };

  const frames =
    framesMap[Number(duration)] || 121;

  const aspectRatio =
    ratio === "9:16" ? "9:16" : "16:9";

  const finalPrompt =
    `${prompt.trim()}. ` +
    `Cinematic video, smooth natural motion, ` +
    `realistic lighting, detailed visuals, ` +
    `professional camera movement, high quality.`;

  console.log(
    "Starting FAL generation:",
    `${duration}s`,
    aspectRatio
  );

  const result = await fal.subscribe(
    "fal-ai/wan/v2.2-5b/text-to-video",
    {
      input: {
        prompt: finalPrompt,

        negative_prompt:
          "blurry, distorted, low quality, " +
          "flickering, unnatural motion",

        num_frames: frames,

        frames_per_second: 24,

        resolution: "720p",

        aspect_ratio: aspectRatio,

        num_inference_steps: 27,

        enable_safety_checker: true,

        enable_output_safety_checker: true,

        guidance_scale: 3.5,

        shift: 5,

        interpolator_model: "none",

        video_quality: "high",

        video_write_mode: "balanced"
      },

      logs: true
    }
  );

  const videoUrl =
    result?.data?.video?.url;

  if (!videoUrl) {
    throw new Error(
      "FAL completed but no video URL was returned."
    );
  }

  return saveVideo(videoUrl);
}

app.get("/api/me", auth, async (req, res) => {
  try {
    const user = await userDoc(
      req.user.uid
    );

    res.json({
      success: true,

      name:
        req.user.name ||
        req.user.email?.split("@")[0] ||
        "User",

      email: req.user.email || "",

      ...user
    });
  } catch (e) {
    console.error("/api/me:", e);

    res.status(500).json({
      error: "Unable to load user data."
    });
  }
});

app.get(
  "/api/history",
  auth,
  async (req, res) => {
    try {
      const snap =
        await db
          .collection("users")
          .doc(req.user.uid)
          .collection("generations")
          .orderBy("createdAt", "desc")
          .limit(20)
          .get();

      res.json({
        success: true,

        items: snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }))
      });
    } catch (e) {
      console.error("/api/history:", e);

      res.status(500).json({
        error:
          "Unable to load generation history."
      });
    }
  }
);

app.post(
  "/api/generate",
  auth,
  async (req, res) => {
    const {
      prompt,
      mode = "video",
      ratio = "16:9",
      duration = 5
    } = req.body || {};

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        error: "Prompt is required."
      });
    }

    if (mode !== "video") {
      return res.status(400).json({
        error:
          "Text to Video is currently enabled."
      });
    }

    const d =
      [5, 10, 15].includes(
        Number(duration)
      )
        ? Number(duration)
        : 5;

    const finalRatio =
      ratio === "9:16"
        ? "9:16"
        : "16:9";

    const cost = d;

    const ref =
      db
        .collection("users")
        .doc(req.user.uid);

    const user =
      await userDoc(req.user.uid);

    const expires =
      user.planExpiresAt == null
        ? null
        : Number(user.planExpiresAt);

    const unlimited =
      Boolean(user.unlimited) &&
      (!expires || Date.now() < expires);

    if (
      !unlimited &&
      Number(user.credits || 0) < cost
    ) {
      return res.status(402).json({
        error:
          `Not enough credits. ` +
          `You need ${cost} credits.`
      });
    }

    if (!unlimited) {
      await ref.update({
        credits:
          admin.firestore.FieldValue.increment(
            -cost
          )
      });
    }

    try {
      const url =
        await makeVideo(
          prompt,
          finalRatio,
          d
        );

      await ref
        .collection("generations")
        .add({
          prompt: prompt.trim(),

          duration: d,

          ratio: finalRatio,

          cost:
            unlimited ? 0 : cost,

          url,

          createdAt:
            admin.firestore.FieldValue.serverTimestamp()
        });

      const after =
        await userDoc(
          req.user.uid
        );

     
