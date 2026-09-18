# BLAST / STONK migration

## Implemented
- Separate public config and project namespace: blast-stonk-v1. Old mints and old public credentials cannot silently relabel another market.
- Official Stonk registry STONK mint: 6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx. Nine decimals.
- Graphite/lime identity, logo, favicons, Top Blasters performance map, price history with range selection, pan, zoom, pinch and keyboard crosshair.
- Map uses canonical backend status. Percentage geometry is display-only. Below 0% is underwater; actual price charts shade below the selected wallet's entry.
- Wallet lookup, activity and reward proof retain existing verified-state checks.
- STONK market quote validates token identity and timestamp. Separate Dexscreener STONK/SOL chart is USD-denominated; it never determines BLAST eligibility.
- Price/index poll 15 seconds, activity 60 seconds, STONK quote 30 seconds. No actual buy-to-UI latency claim before launch.
- Canonical historical observations can persist through the additive supabase/blast-price-history.sql migration. If unavailable, chart uses real epoch reference prices plus current observations. No fake candles or interpolated activity in long gaps.

## Preserved
Weighted-average cost basis, sell/send epoch exclusion, incoming transfers creating no basis, loss-weighted allocation, payout batching, transaction verification and duplicate protection. Database fields and JS compatibility names containing burned/ember/toplast are retained to avoid breaking historical records. No contracts or allocation percentages changed.

Worker reward-guard.mjs now scales dollar limits with finalized reward-token decimals and requires the price-source decimals to match. Six-decimal behavior stays identical. This compatibility fix is tested locally and is not permission to resume payments.

## Required before live BLAST tracking
1. New BLAST mint and launch URL. Verify symbol BLAST, quote mint STONK, pool owner/vaults, launch slot, token programs and creator.
2. Select the supported launch adapter from actual pool/launch metadata. Existing Ember launch profile and RAY-specific Stonk claim verifier are not ready to enable for STONK blindly.
3. Configure an isolated worker database and project; backfill finalized buys from launch. Use the paid Helius endpoint server-side only.
4. Run the additive SQL migration after the existing worker schema. It has not been installed by this pass.
5. Set new public config using vercel-variables.example, verify a matched canonical snapshot, then enable the index flag.
6. Confirm the new public domain and X account.
7. Browser visual/mobile QA. No browser was connected during the final verification session.
8. Explicit authorization to resume airdrops, then verify the new fee route and one tiny STONK cycle. Prior EMBER success does not prove this market.

## Fee cadence
The official Stonk API exposes different creator-fee behavior by launch mode. Do not assume an hourly forwarding schedule. Verify the specific new launch. Keep all send/reviewed recurring flags false meanwhile.

## Gate
NO-GO for a live BLAST launch until the new market, canonical index and STONK reward path are verified. This pass can be reviewed as a rebrand preview. Missing market state stays unavailable, not simulated.

## Verification from this pass
- 57 frontend tests passed, 0 failed.
- 187 worker tests passed, 0 failed, including existing entry/sell/transfer/duplicate protections and new 9-decimal reward conversions.
- Production build READY: dpl_7FXQpecngt5sPPxsCUT2GEdm2yfv.
- Published on existing hosting alias https://burned-coral.vercel.app pending new domain choice.
- Deployed homepage, runtime configuration, logo and market endpoint checked over HTTP. Real STONK quote returned successfully.
- Railway flags rechecked: BURNED_SEND=false, BURNED_REVIEWED_NEXT=false, BURNED_REVIEWED_RECURRING=false. The old Ember worker profile remains in place; no new-market payments enabled.
- New worker decimals compatibility change is local/tested, not deployed to the paused legacy worker.
