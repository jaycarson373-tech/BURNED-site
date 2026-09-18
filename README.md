# Topblast · BLAST / STONK

Trading broadcast built with TradingView Lightweight Charts 5.2.1 and the existing finalized Solana index. No embedded chart, simulated prices or client-side cost-basis engine.

- npm run dev: local site at http://127.0.0.1:5181
- npm test: data, chart integration, configuration and legacy regression tests
- npm run build: validated static output in dist

See CHART-UPGRADE.md for architecture, acceptance results and live-data configuration. Copy new-market deployment values from vercel-variables.example after verifying the BLAST launch. Never put private keys or service-role keys in public config.

TradingView attribution and Apache 2.0 license are included under public/vendor and linked from the footer. Old app.js/style assets remain in source for history and regression coverage but are excluded from the published build.
