# Topblast trading broadcast

## Shipped interface

The main page is now a compact trading workspace: native Lightweight Charts 5.2.1 on the left, linked wallet inspector and Top Blasters on the right, transaction tape below, and expandable Blast Radar. Ink-blue/graphite, ice-white, cyan controls, orange blast events and restrained lime recovery. The old iframe and large campaign sections are gone.

Chart features: line/candles, genuine trade volume, 1m/5m/15m/1h/4h/1d candle intervals, separate history ranges, library pan/wheel/pinch/crosshair, current canonical and selected-entry lines, selected-wallet zone shading, candle countdown, reset/auto-scale, fullscreen where supported, jump-to-live, and older-history loading. Live data preserves a historical viewport. Candle data is never derived from sparse canonical observations.

Buy markers retain transaction time, raw base/quote amounts and execution ratio. Selected wallet markers remain cyan. Crowded markers cluster; a cluster opens its exact buys. The tape and chart select the same wallet. Radar uses actual first verified buy time horizontally and linear current return vertically. Missing entry times are omitted. It is not historical P&L.

The inspector separates underwater status from eligibility. Entry and loss comparisons use STONK per BLAST, not USD. It displays the engine's eligibility projection when available; otherwise it explicitly awaits an eligibility check. Sell/send exclusion remains visible even while a wallet is underwater.

## Audit of preserved engine

Verified buys add exact eligible units and quote cost. Additional buys update weighted average entry. Sells/sends remove units with proportional remaining basis and block the current epoch. Incoming transfers create no basis. Zero units remove the tracked position. The price policy remains max(TWAP, spot), with finalized pool observations and coverage/staleness checks. Existing epoch, reviewed-holder, minimum-position, loss-weighted allocation, funding and payout code remains authoritative.

Changes to worker core files are additive chart records and original block-time metadata. Financial event ordering, cost basis, epoch rules, contracts and signing behavior were not changed.

## Additive chart backend

Worker files: src/chart-export.mjs, src/decoder.mjs, src/engine.mjs, src/store.mjs, src/supabase.mjs and supabase/blast-chart.sql in the worker repository.

- Captures verified swaps separately, including excluded creator activity for truthful market candles. Such activity does not become an eligible wallet position.
- Persists chart trades inside the same finalized-block transaction. Duplicate blocks remain idempotent; gaps/forks retain the existing rejection behavior.
- Export is opt-in with BLAST_CHART_EXPORT=true. Durable export cursor retries failed batches without duplicate rows.
- Candle coverage is published only if the recorded finalized chain starts at the configured launch slot. Enabling it midway through an old index does not certify complete candles.
- PostgreSQL builds genuine OHLCV using slot, transaction and instruction order. History pagination retains empty time gaps; it does not fabricate zero-volume candles.
- All chart writes require the server service role. Public clients have read-only candle/history access. No signing credentials in the browser.
- Canonical line history can use the earlier supabase/blast-price-history.sql migration, then real epoch snapshots as fallback.

## Actual connection status

The published BLAST mint is empty and indexVerified is false. Railway still identifies the old BURNED/EMBER market. No new BLAST market has been substituted. Airdrops stay paused.

Required before live data:
1. Provide the new BLAST mint/launch page; verify mint, STONK quote, programs, pool/vault orientation, decimals, launch slot and supported migration route.
2. Create the isolated blast-stonk-v1 worker ledger and configure the verified market with the paid Helius RPC server-side.
3. Install the existing worker setup.sql followed by worker supabase/blast-chart.sql and, optionally, site supabase/blast-price-history.sql.
4. Deploy the tested chart-export worker changes and enable BLAST_CHART_EXPORT only for the verified new market. These changes are not deployed to the old paused worker by this pass.
5. Backfill the complete finalized chain, confirm matching wallet/price snapshots, then configure PUBLIC_BLAST_* and BLAST_INDEX_VERIFIED on Vercel.
6. Confirm one real buy and its receipt across UI and index. A new reward cycle requires separate authorization; rebranding does not resume airdrops.

## Verification limits

Automated DOM integration uses a chart API test double, not a real browser renderer. It checks tape/marker uniqueness, selected wallet state, fixed old execution prices and historical viewport retention. Backend tests use the existing real transaction fixtures and embedded PostgreSQL for schema, OHLCV, duplicate handling, coverage gating and permissions.

No browser was connected in this session. Native touch gestures, fullscreen behavior and final desktop/mobile visual rendering remain unverified. A real new-market buy/price/receipt cycle cannot be tested until the new BLAST mint and index are configured.

Market and reward statuses are separate. Missing or stale data does not generate crossing announcements, active payout claims or sample activity.

## Test results

- Frontend: 66 passed, 0 failed. Includes DOM/chart API integration, exact-amount handling, snapshot freshness, quote-denominated crossing checks, marker clustering, reconnect pagination and historical viewport retention.
- Worker: 193 passed, 0 failed. Includes existing cost-basis, transfer/sell, reward and duplicate protection regressions; chart projection, export retries and embedded PostgreSQL OHLCV/permission checks.
- Live new-BLAST buy, native browser/mobile gestures and new-market STONK reward: not verified. New mint and connected index are missing; browser connection is unavailable.
- No funds spent and no payout settings enabled.
