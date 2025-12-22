# CEO Shop (Pi Network E-Commerce App)

This project is proprietary and not open-source. Unauthorized use or redistribution is prohibited.

A web-based **e-commerce application** integrated with **Pi Network payments**, deployed on **Cloudflare Pages** with a backend running on **Render**.

The app supports both **Sandbox (development)** and **Production** environments for Pi Network User-to-App payments.

---

## Features

- 🛒 Product checkout flow
- 💰 Pi Network User-to-App payments
- 🔐 Pi SDK v2 authentication with payment scope
- 🔄 Payment approval & completion handled server-side
- 🧪 Sandbox testing environment (Test-Pi)
- 🚀 Production-ready deployment
- 🌐 Multilingual-ready frontend

---

## Environments

### Production
- **URL:** https://ceo-9xi.pages.dev
- **Mode:** Pi Production
- **Currency:** Test-Pi (current phase)
- **Used for:** Pi App checklist & live testing

### Sandbox (Development)
- **URL:** https://chat-ui-30l.pages.dev
- **Mode:** Pi Sandbox
- **Used for:** Payment testing & debugging

> Sandbox and Production use separate Pi SDK modes but can share the same repository and backend.

---

## Tech Stack

### Frontend
- HTML / JavaScript
- Pi Network SDK v2
- Cloudflare Pages

### Backend
- Node.js
- Render
- Pi Network Payments API

---

## Payment Flow

1. User initiates checkout
2. Pi SDK initializes (sandbox or production based on URL)
3. User authenticates with `payments` scope
4. Pi Wallet opens
5. Payment approved by server
6. Payment completed by server
7. Order marked successful

---

## Notes

- Pi Wallet iframe logs and SDK messaging are **expected behavior**
- Sandbox logs are intentionally verbose for debugging
- No image vision is required (orders are initiated via UI / WhatsApp flow)

---

## Status

✅ Sandbox payments working

✅ Production payments working

✅ Pi App's developer checklist completed.

