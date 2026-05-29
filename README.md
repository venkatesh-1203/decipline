# Digital Product Selling Website

A complete digital product selling website with Razorpay payment integration and instant PDF download after successful payment.

## Features

- High-converting landing page UI (Tailwind CSS)
- Razorpay checkout integration
- Secure payment signature verification (backend)
- Protected product download route after payment
- Success and failure pages
- Mobile responsive design

## Project Structure

```text
digitalproduct/
  client/
    index.html
    script.js
    success.html
    failed.html
  server/
    index.js
    package.json
    .env.example
  img.jpeg
  README.md
```

## Tech Stack

- Frontend: HTML5, Tailwind CSS, Vanilla JavaScript
- Backend: Node.js, Express.js
- Payment: Razorpay

## Prerequisites

- Node.js 18+ installed
- Razorpay account (test/live keys)

## Backend Setup

1. Open terminal:
   - `cd server`
2. Install dependencies:
   - `npm install`
3. Create env file:
   - Copy `.env.example` to `.env`
4. Update values in `.env`:
   - `PORT=5000`
   - `RAZORPAY_KEY_ID=your_key_id`
   - `RAZORPAY_KEY_SECRET=your_key_secret`
   - `FRONTEND_URL=http://localhost:5500` (or your frontend URL)
   - `PRODUCT_NAME=Product Photography AI Prompt Vault`
   - `PRODUCT_PRICE_INR=48`
   - `PRODUCT_PDF_PATH=../client/product-photography-ai-prompt-vault.pdf` (or correct absolute path)
   - `PRODUCT_DOWNLOAD_URL=https://productprompts.netlify.app/product-photography-ai-prompt-vault.pdf` (hosted fallback)
   - `DOWNLOAD_TOKEN_SECRET=your_64_character_random_secret`
5. Start backend:
   - `npm start`

Backend runs on: `http://localhost:5000`

## Frontend Setup

Serve the `client` folder using any static server:

- VS Code Live Server, or
- `npx serve client`, or
- any local static server

Then open `client/index.html` through that server URL.

## Payment Flow

1. User clicks **Buy Now**
2. Frontend calls `POST /api/create-order`
3. Razorpay checkout opens
4. On success, frontend sends IDs/signature to `POST /api/verify-payment`
5. Backend verifies signature, payment status, amount, and currency
6. Backend returns secure temporary `downloadUrl`
7. User is redirected to success page and can download PDF

## API Endpoints

- `GET /api/health` - health check
- `GET /api/config` - frontend-safe config (public key + price)
- `POST /api/create-order` - create Razorpay order
- `POST /api/verify-payment` - verify signature and generate download token
- `GET /download?token=...` - protected product download

## Connect Your PDF Product

- Current config uses:
  - `PRODUCT_PDF_PATH=../client/product-photography-ai-prompt-vault.pdf`
- Make sure this file path exists on the server machine, or set `PRODUCT_DOWNLOAD_URL` to a public hosted file URL.
- For production hosting, prefer object storage (S3/R2/GCS) or persistent disk path.

## Deployment

### Backend (Render/Railway)

- Deploy `server` folder as Node service
- Set environment variables from `.env`
- Ensure `FRONTEND_URL` is your deployed frontend domain

### Frontend (Vercel/Netlify)

- Deploy `client` as static site
- Ensure frontend `API_BASE_URL` points to deployed backend URL

## Security Notes

- Never expose `RAZORPAY_KEY_SECRET` on frontend
- Always verify payment signature, amount, currency, and capture status on backend
- Use a long random `DOWNLOAD_TOKEN_SECRET` in production
- Keep `.env` out of git
- Update deployed environment variables when changing price, product name, URLs, or token secret

## Troubleshooting

- If price is not updating, update the deployed backend env vars and restart/redeploy the backend.
- If image not showing, ensure correct relative path in `client/index.html`.
- If download fails, verify `PRODUCT_PDF_PATH` and token validity.

## License

Use for personal or commercial digital product projects.
