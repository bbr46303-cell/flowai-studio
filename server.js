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

/* =========================================================
   ENVIRONMENT VARIABLES
========================================================= */

const FAL_KEY = process.env.FAL_KEY || "";
const RP_ID = process.env.RAZORPAY_KEY_ID || "";
const RP_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

/* =========================================================
   FAL AI
========================================================= */

if (FAL_KEY) {
  fal.config({
    credentials: FAL_KEY
  });

  console.log("FAL_KEY configured successfully.");
} else {
  console.error("FAL_KEY is NOT configured.");
}

/* =========================================================
   FIREBASE ADMIN
========================================================= */

let db = null;

try {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) {
    console.error(
      "FIREBASE_SERVICE_ACCOUNT is NOT configured."
    );
  } else {
    const serviceAccount = JSON.parse(raw);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    db = admin.firestore();

    console.log("Firebase Admin initialized successfully.");
  }
} catch (error) {
  console.error(
    "Firebase Admin initialization error:",
    error?.message || error
  );
}

/* =========================================================
   RAZORPAY
========================================================= */

const razorpay =
  RP_ID && RP_SECRET
    ? new Razorpay({
        key_id: RP_ID,
        key_secret: RP_SECRET
      })
    : null;

if (razorpay) {
  console.log("Razorpay configured successfully.");
} else {
  console.log("Razorpay is not configured.");
}

/* =========================================================
   PLANS
========================================================= */

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

/* =========================================================
   GENERATED VIDEOS DIRECTORY
========================================================= */

const generated = path.join(__dirname, "generated");

if (!fs.existsSync(generated)) {
  fs.mkdirSync(generated, {
    recursive: true
  });
}

app.use(
  "/generated",
  express.static(generated)
);

/* =========================================================
   FRONTEND
========================================================= */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "FlowAI Studio",
    falConfigured: Boolean(FAL_KEY),
    firebaseConfigured: Boolean(db),
    razorpayConfigured: Boolean(razorpay),
    time: new Date().toISOString()
  });
});

/* =========================================================
   FIREBASE AUTH MIDDLEWARE
========================================================= */

async function auth(req, res, next) {
  try {
    if (!db) {
      return res.status(503).json({
        error:
          "Firebase Admin is not configured. Add FIREBASE_SERVICE_ACCOUNT in Render."
      });
    }

    const authorization =
      req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Login required."
      });
    }

    const token =
      authorization.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        error: "Login token is missing."
      });
    }

    const decoded =
      await admin.auth().verifyIdToken(token);

    req.user = decoded;

    next();
  } catch (error) {
    console.error(
      "AUTH ERROR:",
      error?.message || error
    );

    return res.status(401).json({
      error:
        "Login session invalid or expired."
    });
  }
}

/* =========================================================
   USER DOCUMENT
========================================================= */

async function userDoc(uid) {
  const ref =
    db.collection("users").doc(uid);

  const snap = await ref.get();

  if (!snap.exists) {
    const newUser = {
      credits: 50,
      unlimited: false,
      plan: "Free",
      planExpiresAt: null,
      createdAt:
        admin.firestore.FieldValue.serverTimestamp()
    };

    await ref.set(newUser);

    return {
      credits: 50,
      unlimited: false,
      plan: "Free",
      planExpiresAt: null
    };
  }

  return snap.data();
}

/* =========================================================
   DOWNLOAD GENERATED VIDEO
========================================================= */

async function saveVideo(url) {
  if (!url) {
    throw new Error(
      "FAL returned an empty video URL."
    );
  }

  console.log(
    "Downloading generated video..."
  );

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Unable to download generated video. HTTP ${response.status}`
    );
  }

  const buffer =
    Buffer.from(
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
    crypto
      .randomBytes(5)
      .toString("hex") +
    ".mp4";

  const filepath =
    path.join(
      generated,
      filename
    );

  fs.writeFileSync(
    filepath,
    buffer
  );

  console.log(
    "Video saved:",
    filename
  );

  return "/generated/" + filename;
}

/* =========================================================
   FAL ERROR PARSER
========================================================= */

function getFalError(error) {
  let message =
    error?.message ||
    "Unknown FAL error.";

  let status =
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    null;

  let details =
    error?.body ||
    error?.response?.data ||
    error?.data ||
    null;

  if (
    typeof details === "string"
  ) {
    try {
      details =
        JSON.parse(details);
    } catch {
      // Keep string
    }
  }

  return {
    message,
    status,
    details
  };
}

/* =========================================================
   VIDEO GENERATION
========================================================= */

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

  const frames = {
    5: 121,
    10: 241,
    15: 361
  }[duration] || 121;

  const selectedRatio =
    ratio === "9:16"
      ? "9:16"
      : "16:9";

  const finalPrompt =
    prompt.trim() +
    ". Cinematic video, smooth natural motion, realistic lighting, detailed visuals, professional camera movement, high quality.";

  console.log(
    "========================================"
  );

  console.log(
    "STARTING FAL VIDEO GENERATION"
  );

  console.log(
    "Model: fal-ai/wan/v2.2-5b/text-to-video"
  );

  console.log(
    "Duration:",
    duration
  );

  console.log(
    "Ratio:",
    selectedRatio
  );

  console.log(
    "Frames:",
    frames
  );

  console.log(
    "Prompt:",
    prompt.trim()
  );

  console.log(
    "========================================"
  );

  try {
    const result =
      await fal.subscribe(
        "fal-ai/wan/v2.2-5b/text-to-video",
        {
          input: {
            prompt: finalPrompt,

            negative_prompt:
              "blurry, distorted, low quality, flickering, unnatural motion",

            num_frames: frames,

            frames_per_second: 24,

            resolution: "720p",

            aspect_ratio:
              selectedRatio,

            num_inference_steps: 27,

            enable_safety_checker: true,

            enable_output_safety_checker:
              true,

            guidance_scale: 3.5,

            shift: 5,

            interpolator_model:
              "none",

            video_quality:
              "high",

            video_write_mode:
              "balanced"
          },

          logs: true
        }
      );

    console.log(
      "FAL request completed."
    );

    console.log(
      "FAL result received."
    );

    const videoUrl =
      result?.data?.video?.url;

    if (!videoUrl) {
      console.error(
        "FAL returned no video URL."
      );

      console.error(
        "FAL result:",
        JSON.stringify(
          result,
          null,
          2
        )
      );

      throw new Error(
        "FAL completed but no video URL was returned."
      );
    }

    console.log(
      "FAL video URL received successfully."
    );

    return await saveVideo(
      videoUrl
    );
  } catch (error) {
    const falError =
      getFalError(error);

    console.error(
      "========================================"
    );

    console.error(
      "FAL VIDEO GENERATION ERROR"
    );

    console.error(
      "Message:",
      falError.message
    );

    console.error(
      "Status:",
      falError.status
    );

    if (falError.details) {
      console.error(
        "Details:",
        JSON.stringify(
          falError.details,
          null,
          2
        )
      );
    }

    console.error(
      "Full error:",
      error
    );

    console.error(
      "========================================"
    );

    throw error;
  }
}

/* =========================================================
   CURRENT USER
========================================================= */

app.get(
  "/api/me",
  auth,
  async (req, res) => {
    try {
      const user =
        await userDoc(
          req.user.uid
        );

      res.json({
        success: true,

        name:
          req.user.name ||
          req.user.email?.split("@")[0] ||
          "User",

        email:
          req.user.email || "",

        ...user
      });
    } catch (error) {
      console.error(
        "ME ERROR:",
        error?.message || error
      );

      res.status(500).json({
        error:
          "Unable to load user data."
      });
    }
  }
);

/* =========================================================
   GENERATION HISTORY
========================================================= */

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
          .orderBy(
            "createdAt",
            "desc"
          )
          .limit(20)
          .get();

      const items =
        snap.docs.map(
          doc => ({
            id: doc.id,
            ...doc.data()
          })
        );

      res.json({
        success: true,
        items
      });
    } catch (error) {
      console.error(
        "HISTORY ERROR:",
        error?.message || error
      );

      res.status(500).json({
        error:
          "Unable to load generation history."
      });
    }
  }
);

/* =========================================================
   GENERATE VIDEO
========================================================= */

app.post(
  "/api/generate",
  auth,
  async (req, res) => {
    let cost = 5;
    let unlimited = false;
    let creditCharged = false;
    let ref = null;

    try {
      const {
        prompt,
        mode = "video",
        ratio = "16:9",
        duration = 5
      } = req.body || {};

      /* -----------------------------
         VALIDATION
      ----------------------------- */

      if (!prompt?.trim()) {
        return res.status(400).json({
          error:
            "Prompt is required."
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

      cost = d;

      ref =
        db
          .collection("users")
          .doc(req.user.uid);

      /* -----------------------------
         USER DATA
      ----------------------------- */

      const user =
        await userDoc(
          req.user.uid
        );

      unlimited = Boolean(
        user.unlimited &&
        (
          !user.planExpiresAt ||
          Date.now() <
            Number(
              user.planExpiresAt
            )
        )
      );

      console.log(
        "Generate request from:",
        req.user.uid
      );

      console.log(
        "Plan:",
        user.plan || "Free"
      );

      console.log(
        "Credits:",
        user.credits
      );

      console.log(
        "Unlimited:",
        unlimited
      );

      /* -----------------------------
         CREDIT CHECK
      ----------------------------- */

      if (
        !unlimited &&
        Number(user.credits || 0) <
          cost
      ) {
        return res.status(402).json({
          error:
            `Not enough credits. You need ${cost} credits.`
        });
      }

      /* -----------------------------
         DEDUCT CREDITS
      ----------------------------- */

      if (!unlimited) {
        await ref.update({
          credits:
            admin.firestore.FieldValue.increment(
              -cost
            )
        });

        creditCharged = true;

        console.log(
          `${cost} credits deducted.`
        );
      }

      /* -----------------------------
         GENERATE
      ----------------------------- */

      const videoUrl =
        await makeVideo(
          prompt,
          ratio,
          d
        );

      /* -----------------------------
         SAVE HISTORY
      ----------------------------- */

      await ref
        .collection(
          "generations"
        )
        .add({
          prompt:
            prompt.trim(),

          duration: d,

          ratio:
            ratio === "9:16"
              ? "9:16"
              : "16:9",

          cost:
            unlimited
              ? 0
              : cost,

          url:
            videoUrl,

          createdAt:
            admin.firestore.FieldValue.serverTimestamp()
        });

      /* -----------------------------
         CURRENT BALANCE
      ----------------------------- */

      const after =
        await userDoc(
          req.user.uid
        );

      console.log(
        "VIDEO GENERATION SUCCESS"
      );

      res.json({
        success: true,

        type: "video",

        url: videoUrl,

        duration: d,

        ratio:
          ratio === "9:16"
            ? "9:16"
            : "16:9",

        credits:
          after.credits,

        unlimited
      });
    } catch (error) {
      /* -----------------------------
         DETAILED ERROR
      ----------------------------- */

      console.error(
        "========================================"
      );

      console.error(
        "VIDEO GENERATION ERROR"
      );

      console.error(
        "Message:",
        error?.message
      );

      console.error(
        "Status:",
        error?.status ||
          error?.statusCode ||
          error?.response?.status ||
          "N/A"
      );

      if (error?.body) {
        console.error(
          "Body:",
          typeof error.body ===
            "string"
            ? error.body
            : JSON.stringify(
                error.body,
                null,
                2
              )
        );
      }

      if (
        error?.response?.data
      ) {
        console.error(
          "Response data:",
          JSON.stringify(
            error.response.data,
            null,
            2
          )
        );
      }

      console.error(
        "Full error
