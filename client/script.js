const buyBtn = document.getElementById("buyBtn");
const statusText = document.getElementById("statusText");
const priceText = document.getElementById("priceText");
const defaultOrigin = window.location.protocol === "file:" ? "http://localhost:5000" : window.location.origin;
const inferredBackend = window.location.hostname === "productprompts.netlify.app"
  ? "https://decipline-2.onrender.com"
  : window.location.hostname === "decipline-2.onrender.com"
    ? window.location.origin
    : defaultOrigin;
const API_BASE_URL = window.APP_CONFIG?.API_BASE_URL || inferredBackend;
const vaultFileUrl = "./ecommerce_product_photography_prompt_pack.html";
let productConfig = {
  productName: "Product Photography AI Prompt Vault",
  currency: "INR"
};

function absoluteApiUrl(path) {
  return new URL(path, API_BASE_URL).toString();
}

function setLoadingState(isLoading, text = "") {
  buyBtn.disabled = isLoading;
  buyBtn.textContent = isLoading ? "Processing..." : "Buy Now - Get Instant Access";
  statusText.textContent = text;
}

async function readJsonResponse(response, fallbackMessage) {
  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(fallbackMessage);
  }

  if (!response.ok) {
    throw new Error(data.message || fallbackMessage);
  }

  return data;
}

async function loadConfig() {
  try {
    const response = await fetch(absoluteApiUrl("/api/config"));
    const data = await readJsonResponse(response, "Unable to load payment settings.");
    if (data?.productName) {
      productConfig.productName = data.productName;
    }
    if (data?.currency) {
      productConfig.currency = data.currency;
    }
    if (data?.productPriceInr) {
      priceText.textContent = `Rs. ${data.productPriceInr}`;
    }
  } catch (error) {
    console.error("Could not load config:", error);
    setLoadingState(false, "Unable to reach payment server. Check backend URL or network.");
  }
}

async function createOrder() {
  const response = await fetch(absoluteApiUrl("/api/create-order"), {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });

  return readJsonResponse(response, "Failed to create order.");
}

async function verifyPayment(paymentResponse) {
  const response = await fetch(absoluteApiUrl("/api/verify-payment"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(paymentResponse)
  });

  const data = await readJsonResponse(response, "Verification failed");
  if (!data.success) {
    throw new Error(data.message || "Verification failed");
  }

  return data;
}

async function startPayment() {
  try {
    if (typeof Razorpay === "undefined") {
      throw new Error("Payment checkout could not load. Please refresh and try again.");
    }

    setLoadingState(true, "Creating your secure order...");

    const configRes = await fetch(absoluteApiUrl("/api/config"));
    const config = await readJsonResponse(configRes, "Unable to load payment settings.");

    if (!config.razorpayKeyId) {
      throw new Error("Razorpay key not configured on server.");
    }

    const orderData = await createOrder();

    const options = {
      key: config.razorpayKeyId,
      amount: orderData.amount,
      currency: orderData.currency,
      name: config.productName || productConfig.productName,
      description: "Interactive HTML Vault Access",
      order_id: orderData.orderId,
      handler: async function (response) {
        try {
          setLoadingState(true, "Verifying your payment...");
          await verifyPayment(response);

          const vaultUrl = new URL(vaultFileUrl, window.location.href);
          vaultUrl.searchParams.set("download", "pdf");
          window.location.href = vaultUrl.toString();
        } catch (error) {
          console.error(error);
          const failedUrl = new URL("./failed.html", window.location.href);
          failedUrl.searchParams.set("reason", "verification_failed");
          window.location.href = failedUrl.toString();
        }
      },
      modal: {
        ondismiss: function () {
          setLoadingState(false, "Payment window closed. You can try again.");
        }
      },
      theme: {
        color: "#06b6d4"
      }
    };

    const razorpayCheckout = new Razorpay(options);
    razorpayCheckout.on("payment.failed", function () {
      const failedUrl = new URL("./failed.html", window.location.href);
      failedUrl.searchParams.set("reason", "payment_failed");
      window.location.href = failedUrl.toString();
    });

    setLoadingState(false);
    razorpayCheckout.open();
  } catch (error) {
    console.error(error);
    setLoadingState(false, error?.message || "Something went wrong. Please try again.");
  }
}

buyBtn.addEventListener("click", startPayment);
loadConfig();
