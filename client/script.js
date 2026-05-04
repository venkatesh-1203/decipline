const buyBtn = document.getElementById("buyBtn");
const statusText = document.getElementById("statusText");
const priceText = document.getElementById("priceText");
const API_BASE_URL = window.APP_CONFIG?.API_BASE_URL || "http://localhost:5000";

function setLoadingState(isLoading, text = "") {
  buyBtn.disabled = isLoading;
  buyBtn.textContent = isLoading ? "Processing..." : "Buy Now - Get Instant Access";
  statusText.textContent = text;
}

async function loadConfig() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config`);
    const data = await response.json();
    if (data?.productPriceInr) {
      priceText.textContent = `₹${data.productPriceInr}`;
    }
  } catch (error) {
    console.error("Could not load config:", error);
  }
}

async function createOrder() {
  const response = await fetch(`${API_BASE_URL}/api/create-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });

  if (!response.ok) {
    throw new Error("Failed to create order");
  }

  return response.json();
}

async function verifyPayment(paymentResponse) {
  const response = await fetch(`${API_BASE_URL}/api/verify-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(paymentResponse)
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "Verification failed");
  }

  return data;
}

async function startPayment() {
  try {
    setLoadingState(true, "Creating your secure order...");

    const configRes = await fetch(`${API_BASE_URL}/api/config`);
    const config = await configRes.json();

    if (!config.razorpayKeyId) {
      throw new Error("Razorpay key not configured on server.");
    }

    const orderData = await createOrder();

    const options = {
      key: config.razorpayKeyId,
      amount: orderData.amount,
      currency: orderData.currency,
      name: "DigitalProduct",
      description: "Instant PDF Access",
      order_id: orderData.orderId,
      handler: async function (response) {
        try {
          setLoadingState(true, "Verifying your payment...");
          const verifyData = await verifyPayment(response);

          const successUrl = new URL("./success.html", window.location.href);
          successUrl.searchParams.set("download", `${API_BASE_URL}${verifyData.downloadUrl}`);
          window.location.href = successUrl.toString();
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
    setLoadingState(false, "Something went wrong. Please try again.");
  }
}

buyBtn.addEventListener("click", startPayment);
loadConfig();
