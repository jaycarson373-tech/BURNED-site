# Topblast · TOPBLAST / SOL on Pump

The original Topblast product rebuilt around a new Pump mainnet launch: finalized verified buys, exact weighted-average entry, a personal Blast Zone, wallet lookup, chart markers, reward receipts, and honest unavailable states.

- `npm run dev` runs the local site at `http://127.0.0.1:5181`.
- `npm test` verifies chart, wallet, configuration, finality, deduplication and accounting-display behavior.
- `npm run build` validates the static production output in `dist`.

The public build starts fail-closed in PRELAUNCH. Add the new verified Pump mint and isolated index only after launch. Private keys, Helius credentials and Supabase service-role credentials stay on Railway. Vercel receives only publishable index configuration.

The Pump reward engine remains a separate reviewed service. Do not enable automatic rewards from this frontend or by setting only a public flag. A real per-mint fee receipt, eligible snapshot, finalized payout and restart reconciliation are still required before advertising rewards as active.
