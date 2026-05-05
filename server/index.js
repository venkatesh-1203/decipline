const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5000);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5500";
const PRODUCT_NAME = process.env.PRODUCT_NAME || "Discipline Blueprint PDF";
const PRODUCT_PRICE_INR = Number(process.env.PRODUCT_PRICE_INR || 49);
const PRODUCT_PDF_PATH =
  process.env.PRODUCT_PDF_PATH || path.join(__dirname, "products", "You.pdf");
const DOWNLOAD_TOKEN_SECRET =
  process.env.DOWNLOAD_TOKEN_SECRET || process.env.RAZORPAY_KEY_SECRET || "fallback_secret";

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.warn("Missing Razorpay keys. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env");
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || ""
});

// CORS configuration with origin validation
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const isProduction = process.env.NODE_ENV === "production";
    const allowedOrigins = [
      "https://deciplinetrackee.netlify.app",
      FRONTEND_URL
    ];

    // Development: Allow all localhost/127.0.0.1 variants
    if (!isProduction) {
      const isLocalhost =
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:") ||
        origin === "http://localhost" ||
        origin === "http://127.0.0.1";
      if (isLocalhost) {
        return callback(null, true);
      }
    }

    // Production: Only allow listed origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 3600,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function createDownloadToken(payload) {
  const payloadJson = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(payloadJson);
  const signature = crypto
    .createHmac("sha256", DOWNLOAD_TOKEN_SECRET)
    .update(encodedPayload)
    .digest("hex");

  return `${encodedPayload}.${signature}`;
}

function verifyDownloadToken(token) {
  const [encodedPayload, signature] = (token || "").split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid token format");
  }

  const expectedSignature = crypto
    .createHmac("sha256", DOWNLOAD_TOKEN_SECRET)
    .update(encodedPayload)
    .digest("hex");

  if (signature !== expectedSignature) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  if (!payload.exp || Date.now() > payload.exp) {
    throw new Error("Token expired");
  }

  return payload;
}

app.get("/api/health", (_, res) => {
  res.json({ ok: true, message: "Server is running" });
});

app.get("/api/config", (_, res) => {
  res.json({
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
    productPriceInr: PRODUCT_PRICE_INR,
    currency: "INR",
    productName: PRODUCT_NAME
  });
});

app.post("/api/create-order", async (req, res) => {
  try {
    const amount = PRODUCT_PRICE_INR * 100;
    const receipt = `receipt_${Date.now()}`;

    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt,
      notes: {
        product: PRODUCT_NAME
      }
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      productName: PRODUCT_NAME
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({
      success: false,
      message: "Could not create order. Please try again."
    });
  }
});

app.post("/api/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing payment verification fields."
      });
    }

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed. Signature mismatch."
      });
    }

    // Extra safety: fetch payment from Razorpay and verify relation + capture status.
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (!payment || payment.order_id !== razorpay_order_id || payment.status !== "captured") {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed. Invalid payment state."
      });
    }

    const token = createDownloadToken({
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      exp: Date.now() + 1000 * 60 * 30
    });

    return res.json({
      success: true,
      message: "Payment verified successfully.",
      downloadUrl: `/download?token=${token}`
    });
  } catch (error) {
    console.error("Verify payment error:", error);
    return res.status(500).json({
      success: false,
      message: "Could not verify payment."
    });
  }
});

app.get("/download", (req, res) => {
  try {
    const { token } = req.query;
    verifyDownloadToken(token);

    if (!fs.existsSync(PRODUCT_PDF_PATH)) {
      return res.status(404).send("Product file not found on server.");
    }

    return res.download(PRODUCT_PDF_PATH, "digital-product.pdf");
  } catch (error) {
    return res.status(403).send("Unauthorized or expired download link.");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

