# chat-ui
A simple multilingual chat interface deployed on Cloudflare Pages, connected to a Render backend, with Pi Network SDK integration for authentication and payments (Sandbox & Production).

🌐 Live URLs
Production
Frontend: https://ceo-9xi.pages.dev
Pi App (Production): https://minepi.com/mobile-app-ui/app/ceo-shop
Sandbox / Development
Frontend (Dev): https://chat-ui-30l.pages.dev
Pi App (Sandbox): https://sandbox.minepi.com/mobile-app-ui/app/ceo-shop

⚠️ Important:
Pi Network requires different URLs for:
Production URL (user-facing)
Development URL (sandbox testing)
Using the same URL for both will cause Pi Wallet to hang or fail to open.

🧩 Architecture
Copy code

Frontend (Cloudflare Pages)
        |
        v
Backend API (Render)
        |
        v
Pi Network SDK (Auth + Payments)
Frontend: Static JS app (Cloudflare Pages)
Backend: Node.js API (Render)
Payments: Pi Network SDK v2.0
Environment: Test Pi / Testnet (no real Pi involved)

💳 Pi Network Payment Integration
Key Features
Pi SDK v2.0
Sandbox & Production separation
Deferred authentication (only when payment starts)
Incomplete payment recovery
Server-side approval & completion
Test Pi only (safe for development)
Environment Detection Logic
Sandbox mode is determined by hostname:
const isSandbox =
  window.location.hostname === 'chat-ui-30l.pages.dev' ||
  window.location.hostname === 'localhost' ||
  window.location.search.includes('sandbox=true');
  
This ensures:
Sandbox URL → Pi.init({ sandbox: true })
Production URL → Pi.init({ sandbox: false })
✅ Known Behaviors (Not Bugs)
✅ Iframe logs are expected in Pi Browser
✅ SDKMessaging instantiated on Pi environment: production
→ Normal, even in sandbox
✅ Extra console logs during sandbox testing
→ Useful for Pi checklist & debugging
❌ Stuck Pi Wallet
→ Caused by using the same URL for dev & prod (now fixed)

🔐 Environment Variables
Both frontend URLs share the same backend and repo, but environment variables must exist:
APP_WALLET_SECRET=your_test_wallet_secret
PI_API_KEY=your_test_pi_api_key
These are Test Pi credentials, not real Pi.

🧪 Pi Checklist Status
✅ Pi Browser access
✅ Production URL configured
✅ Development (Sandbox) URL configured
✅ User-to-App payment successful
✅ Server approval & completion working
✅ Wallet opens correctly in sandbox & production

🚀 Deployment Notes
No redeploy needed for frontend when backend logic changes (unless API URLs change)
Sandbox logs do not need cleanup
Same backend can safely serve both sandbox & production

📝 Final Notes
This project required extensive testing due to:
Pi SDK iframe behavior
Sandbox vs production URL separation
Wallet initialization timing
After correct URL separation, everything works as expected.
The logs and iframe behavior are normal Pi SDK behavior, not bugs.
