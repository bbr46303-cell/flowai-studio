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

/* =========================
   FAL AI
========================= */

const FAL_KEY = process.env.FAL_KEY || "";

if (FAL_KEY) {
  fal.config({
    credentials: FAL_KEY
  });
}

/* =========================
   FIREBASE ADMIN
========================= */

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
    console.log("FIREBASE_SERVICE_ACCOUNT not configured");
  }
} catch (error) {
  console.error("Firebase Admin init error:", error.message);
}

/* =========================
   RAZORPAY
========================= */

const RP_ID = process.env.RAZORPAY_KEY_ID || "";
const RP_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

const razorpay =
  RP_ID && RP_SECRET
    ? new Razorpay({
        key_id: RP_ID,
        key_secret: RP_SECRET
      })
    : null;

/* =========================
   PLANS
========================= */

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

/* =========================
   VIDEO STORAGE
========================= */

const generatedDir = path.join(__dirname, "generated");

if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, {
    recursive: true
  });
}

app.use(
  "/generated",
  express.static(generatedDir)
);

/* =========================
   ROUTES
========================= */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    falConfigured: Boolean(FAL_KEY),
    firebaseConfigured: Boolean(db),
    razorpayConfigured: Boolean(razorpay)
  });
});

/* =========================
   AUTH
========================= */

async function auth(req, res, next) {
  try {
    if (!db) {
      return res.status(503).json({
        error:
          "Firebase Admin is not configured. Add FIREBASE_SERVICE_ACCOUNT in Render."
      });
    }

    const header =
      req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Login required."
      });
    }

    const token = header.slice(7);

    req.user =
      await admin.auth().verifyIdToken(token);

    next();
  } catch (error) {
    console.error(
      "Authentication error:",
      error.message
    );

    return res.status(401).json({
      error:
        "Login session invalid or expired."
    });
  }
}

/* =========================
   USER
========================= */

async function userDoc(uid) {
  const ref = db
    .collection("users")
    .doc(uid);

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

/* =========================
   SAVE VIDEO
========================= */

async function saveVideo(url) {
  if (!url) {
    throw new Error(
      "Generated video URL is missing."
    );
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
    throw new Error(
      "Generated video is empty."
    );
  }

  const filename =
    Date.now() +
    "-" +
    crypto.randomBytes(5).toString("hex") +
    ".mp4";

  const filepath = path.join(
    generatedDir,
    filename
  );

  fs.writeFileSync(filepath, buffer);

  return "/generated/" + filename;
}

/* =========================
   MAKE VIDEO
========================= */

async function makeVideo(
  prompt,
  ratio,
  duration
) {
  if (!FAL_KEY) {
    throw new Error(
      "FAL_KEY is not configured on the server."
    );
  }

  const durationNumber = Number(duration);

  const framesMap = {
    5: 121,
    10: 241,
    15: 361
  };

  const frames =
    framesMap[durationNumber] || 121;

  const aspectRatio =
    ratio ===
