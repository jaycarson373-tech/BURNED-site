# Topblast Pump relaunch gate

## Ready in this repository

- Original Topblast mechanic and green comet identity.
- Interactive TradingView Lightweight Charts surface with pan, zoom, intervals, crosshair, selected-wallet entry line, Blast Zone shading and real buy markers.
- Finalized-index checks, matched market identity, exact integer display, deduplication, stale-state handling and wallet validation.
- Weighted-average entries remain canonical backend values. Incoming transfers create no basis. Sell or send exclusion is displayed from the engine snapshot.
- Pump buy link, Solscan contract link and Dexscreener link stay disabled until the verified mint is configured.
- The PONS/EVM adapter, Stonk market, old addresses and old public X account were removed.

## Required after the new Pump mint exists

1. Verify the mint, Pump creation transaction, creator, bonding curve or PumpSwap pool, token decimals and launch slot on mainnet.
2. The Pump-only worker registers `topblast-pump-v1`, backfills every finalized buy from launch and publishes the read-only `topblast_site_*` projections consumed by this frontend.
3. Configure Railway with its server-only Helius/RPC, Supabase service role and reviewed signer settings. Keep `DRY_RUN=true`, payout sending paused and secrets off Vercel during acceptance.
4. Configure Vercel with the values in `vercel-variables.example`; enable market/index flags only after the public snapshot matches the verified mint.
5. Prove one genuine per-mint Pump fee receipt, a below-entry eligible snapshot, one finalized holder payout, receipt visibility and restart-safe duplicate prevention.

## Gate

The interface is launch-staged. The automated reward product remains **NO-GO** until the new CA and the real end-to-end Pump reward cycle pass. No automatic payouts were enabled or sent by this pass.
