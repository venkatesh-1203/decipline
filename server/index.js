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
const FRONTEND_URL = process.env.FRONTEND_URL || "https://productprompts.netlify.app/";
const PRODUCT_NAME = process.env.PRODUCT_NAME || "Product Photography AI Prompt Vault";
const PRODUCT_CURRENCY = "INR";
const PRODUCT_PRICE_INR = parsePositiveInteger(process.env.PRODUCT_PRICE_INR, 48);
const PRODUCT_PDF_PATH = resolveFilePath(
  process.env.PRODUCT_PDF_PATH,
  path.join(__dirname, "..", "client", "product-photography-ai-prompt-vault.pdf")
);
const PRODUCT_DOWNLOAD_URL =
  process.env.PRODUCT_DOWNLOAD_URL ||
  "https://productprompts.netlify.app/product-photography-ai-prompt-vault.pdf";
const DOWNLOAD_TOKEN_SECRET = getDownloadTokenSecret();

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.warn("Missing Razorpay keys. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env");
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || ""
});

function parsePositiveInteger(value, fallbackValue) {
  const parsedValue = Number(value);
  if (Number.isInteger(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }

  return fallbackValue;
}

function resolveFilePath(configuredPath, fallbackPath) {
  if (!configuredPath) {
    return fallbackPath;
  }

  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }

  return path.resolve(__dirname, configuredPath);
}

function getDownloadTokenSecret() {
  const configuredSecret = process.env.DOWNLOAD_TOKEN_SECRET || process.env.RAZORPAY_KEY_SECRET;
  const placeholderSecrets = new Set([
    "fallback_secret",
    "replace_with_a_long_random_secret",
    "change_me",
    "your_random_secret"
  ]);

  if (configuredSecret && configuredSecret.length >= 32 && !placeholderSecrets.has(configuredSecret)) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Set DOWNLOAD_TOKEN_SECRET to a long random value before running in production.");
  }

  console.warn("Using development download token secret. Set DOWNLOAD_TOKEN_SECRET for production.");
  return "local_development_download_secret_change_before_deploy";
}

function normalizeOrigin(origin) {
  if (!origin) {
    return "";
  }

  return origin.trim().replace(/\/+$/, "");
}

const allowedOrigins = new Set(
  [
    "https://productprompts.netlify.app/",
    "https://decipline-2.onrender.com",
    FRONTEND_URL,
    "http://localhost:3000",
    "http://localhost:5000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5000"
  ].map(normalizeOrigin)
);

if (process.env.NODE_ENV !== "production") {
  allowedOrigins.add("null");
}

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = normalizeOrigin(origin);
    if (normalizedOrigin === "null") {
      return callback(null, true);
    }

    // Allow localhost variants in development
    const isLocalhost =
      normalizedOrigin.startsWith("http://localhost:") ||
      normalizedOrigin.startsWith("http://127.0.0.1:");

    if (isLocalhost || allowedOrigins.has(normalizedOrigin)) {
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

app.set("trust proxy", 1);
app.set("query parser", "simple");
app.disable("x-powered-by");
app.use((_, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "20kb" }));

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

  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  if (!payload.exp || Date.now() > payload.exp) {
    throw new Error("Token expired");
  }

  return payload;
}

app.get("/", (_, res) => {
  res.json({ message: "Digital Product API Server", status: "running" });
});

app.get("/api/health", (_, res) => {
  res.json({ ok: true, message: "Server is running" });
});

app.get("/api/config", (_, res) => {
  res.json({
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
    productPriceInr: PRODUCT_PRICE_INR,
    currency: PRODUCT_CURRENCY,
    productName: PRODUCT_NAME
  });
});

app.post("/api/create-order", async (req, res) => {
  try {
    const amount = PRODUCT_PRICE_INR * 100;
    const receipt = `receipt_${Date.now()}`;

    const order = await razorpay.orders.create({
      amount,
      currency: PRODUCT_CURRENCY,
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

    const generatedSignatureBuffer = Buffer.from(generatedSignature, "hex");
    const razorpaySignatureBuffer = Buffer.from(razorpay_signature, "hex");
    if (
      generatedSignatureBuffer.length !== razorpaySignatureBuffer.length ||
      !crypto.timingSafeEqual(generatedSignatureBuffer, razorpaySignatureBuffer)
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed. Signature mismatch."
      });
    }

    // Extra safety: fetch payment from Razorpay and verify relation + capture status.
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (
      !payment ||
      payment.order_id !== razorpay_order_id ||
      payment.status !== "captured" ||
      payment.amount !== PRODUCT_PRICE_INR * 100 ||
      payment.currency !== PRODUCT_CURRENCY
    ) {
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

    if (PRODUCT_PDF_PATH && fs.existsSync(PRODUCT_PDF_PATH)) {
      return res.download(PRODUCT_PDF_PATH, "digital-product.pdf");
    }

    if (PRODUCT_DOWNLOAD_URL) {
      return res.redirect(PRODUCT_DOWNLOAD_URL);
    }

    return res.status(404).send("Product file not found on server.");
  } catch (error) {
    return res.status(403).send("Unauthorized or expired download link.");
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = {
  app,
  createDownloadToken,
  normalizeOrigin,
  parsePositiveInteger,
  resolveFilePath,
  verifyDownloadToken
};

