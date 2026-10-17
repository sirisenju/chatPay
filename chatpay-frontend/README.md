# ChatPay frontend

Next.js frontend for ChatPay’s Stellar Testnet payment workspace.

Run `npm run dev` and open http://localhost:3000. The landing page, onboarding, and wallet connection are public; `/chat` requires a backend-verified Freighter sign-in.

See [workspace setup](docs/workspace-setup.md) for backend configuration, sign-in/payment behavior, and verification. Local development defaults to http://localhost:4000; production/Vercel defaults to https://chatpay-7anj.onrender.com. Override either with the server-only `CHATPAY_API_URL` variable.

Run `npm test` for wallet and payment-flow checks, and `npm run build` for the production build.
