# Topblast

Live market, wallet-cost-basis, Blast Zone, leaderboard, and reward foundation for a Pons V2 token paired directly with QQQ on Robinhood Chain.

```sh
npm install
cp .env.example .env
npm run dev
```

Before launch, keep the token address empty. After launch, run `npm run configure:launch -- <token CA> <https://x.com/account>`. The worker verifies the Pons V2 factory event and derives the curve, quote asset, launch block, decimals, fee recipient, and market phase from that token. The UI refuses to substitute historical or sample activity.

Run `npm test`, `npm run test:contracts`, and `npm run build` for local verification. `npm run doctor` checks the live RPC without submitting transactions. `npm run preflight` is the final read-only production gate after the live CA and X URL are configured.

Read [LAUNCH_RUNBOOK.md](./LAUNCH_RUNBOOK.md) before creating the token. The reward adapter must be the Pons creator fee recipient for automatic QQQ funding.

Railway builds are split into `railway.index.toml` and `railway.rewards.toml`. Both services need persistent `/data` volumes; only the index service receives a public domain.

To initialize version control after a ZIP download: `git init -b main`. The Mean Machine CLI does this automatically.

Read PROJECT.md for module capabilities and remaining integrations.
