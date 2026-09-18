# topblast-robinhood

Generated from Mean Machine 0.1.0; network: Robinhood mainnet, chain 4663.

## Product brief

Topblast is a Robinhood Chain market product launched through Pons V2. The public name is **Topblast**, the ticker is **TOPBLAST**, the intended pair is **TOPBLAST / QQQ**, and the eventual fee-funded reward asset is QQQ.

The interface is chart-first. It shows finalized TOPBLAST trades, QQQ-denominated candles, exact buy markers, a selected wallet's verified weighted-average entry, current return, Blast Zone state, epoch eligibility, a live ledger, and a leaderboard of underwater wallets. No sample market activity or simulated candles are allowed in production.

The former Solana BLAST/STONK implementation is preserved at the Git tag `checkpoint/topblast-blast-stonk-2026-09-14`. The Robinhood/Pons implementation now replaces the public `main` tree in the existing site repository so the established Vercel project can continue without a second import.

## Product rules

- A Pons `CurveBuy` creates tracked units and QQQ-denominated cost basis for its actual recipient using the event's settled `quoteIn` and `tokensOut`.
- Additional verified buys update weighted-average entry.
- A partial sell reduces verified units and their proportional basis. The remaining average entry stays unchanged.
- A full sell clears tracked units and basis. A later verified buy creates a fresh position.
- An incoming ERC-20 transfer creates no cost basis and no eligible units.
- An outgoing transfer reduces tracked units and excludes the sender for the current epoch.
- A self-transfer is neutral.
- A sell excludes the seller for the current epoch.
- `current QQQ per TOPBLAST price < verified average entry` means the position is underwater or `BLASTED`.
- Being underwater and being reward-eligible are separate states.
- The current loss-weight prototype weights an eligible wallet by its absolute unrealized QQQ loss. This remains a keeper-side policy and must be approved and locked before live rewards.
- Public copy says “each reward epoch.” No exact cadence is promised until live sweep, claim, snapshot, submission, and confirmation timing is measured.

## Pons integration decisions

- Robinhood Chain mainnet: chain ID `4663`.
- Pons V2 factory: `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`.
- Pons V2 fee escrow: `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e`.
- QQQ: `0xD5f3879160bc7c32ebb4dC785F8a4F505888de68`.
- QQQ was read from the live factory as an approved pair asset on 2026-09-14. PONS itself was not approved, so it is not used as the pair.
- A custom QQQ pair pays creator fees in QQQ. The inherited direct-token fee adapter therefore does not require a swap route.
- Pre-graduation indexing uses finalized `CurveBuy`, `CurveSell`, and token `Transfer` logs. The event values are authoritative, including partial fills and launch-window tax effects.
- Current curve price uses `getReserves()` pricing reserves in QQQ per TOPBLAST. Physical quote balance is not used for display or eligibility.
- The browser consumes one canonical index API. It never recomputes cost basis.
- The index backfills missed finalized logs, deduplicates by transaction hash and log index, stores a persisted cursor, polls every two seconds by default, and pushes refreshed state over SSE.

## Current implementation

- `src/market-state.mjs`: deterministic ERC-20 position ledger, exclusion rules, current Blast state, loss-weight allocation, and genuine trade-to-OHLCV aggregation.
- `server/pons-discovery.mjs`: token-only Pons V2 launch discovery and validation. It verifies the factory event, factory launch record, QQQ pair, curve binding, code, metadata, decimals, fee recipient, and lifecycle phase.
- `server/indexer.mjs`: read-only Pons curve/token index with persisted backfill, finality delay, deduplication, wallet views, exact interval candles, correctly bucketed buy markers, fixed-block reward snapshots, REST endpoints, rate limiting, allowlisted CORS, stale state, health state, and SSE updates.
- `src/TopblastChart.jsx`: TradingView Lightweight Charts with line/candle views, volume, 1m through 1d controls, pan, wheel/pinch zoom, crosshair OHLC, reset, fullscreen, buy markers, and jump-to-live.
- `src/App.jsx`: Robinhood neon trading interface, wallet lookup, live tape, Top Blasters, honest empty states, and responsive layout.
- `contracts/HoodBrokerRewards.sol`: unchanged inherited reward foundation retained for source provenance.
- `contracts/TopblastRewards.sol`: project-specific QQQ fee adapter using the deployed Pons V2 `claimToken(address)` interface and a duplicate-safe distributor that emits one verified `RewardPaid` receipt per wallet.
- `server/reward-worker.mjs`: transaction-gated reward worker. It verifies every contract and fee-recipient binding, consumes a finalized fixed-block index snapshot, allocates by absolute unrealized QQQ loss, resumes an active epoch, skips paid wallets, waits for confirmations, and stays in dry-run mode unless `EXECUTE_REWARDS=true`.
- `scripts/configure-launch.mjs`: verifies and configures a launch from only the token CA and X URL.
- `scripts/preflight.mjs`: read-only production gate across the index, token, pair, phase, reward contracts, keeper, and fee recipient.

The selected Mean Machine snapshot module reconstructs ERC-721 ownership and is intentionally not used for TOPBLAST accounting. TOPBLAST is ERC-20. The new event ledger above supplies its tracked state instead.

## Selected modules
### Wallet connect
Injected-wallet connection, Robinhood network switching, and an optional WalletConnect adapter.

Before live use: WalletConnect needs your project ID and allowed domain. Wallet connection does not establish a server login.

Origin: Mean Machine adapter using ethers and WalletConnect.
Documentation: https://docs.walletconnect.network/

Topblast currently exposes wallet address lookup and injected browser-wallet support. WalletConnect is intentionally disabled in the launch build to keep the public dependency surface small; it can be restored later with a project-specific ID and domain allowlist.

### Holder snapshots
ERC-721 transfer reconstruction, wallet grouping, snapshot hashing, exclusions, and deterministic scheduling. Original tests included.

Before live use: Provide the NFT contract, deployment block, and a confirmed snapshot block. Receiver code checks use current state. Token IDs must fit Number.MAX_SAFE_INTEGER; large IDs need a string-safe adaptation.

Origin: Exact keeper/core.mjs from Hood Brokers, revision 93059ad. Holder snapshots, not Snapshot.org governance.
Documentation: https://github.com/jaycarson373-tech/hood-brokers

### Airdrop engine
Integer reward allocation, explicit rounding dust, unpaid batches, and the HoodBrokerDistributor contract with tests.

Before live use: Deploy and fund the distributor, configure its keeper, use a fixed snapshot, and confirm transaction receipts.

Origin: Exact reward logic and contracts from Hood Brokers, revision 93059ad.
Documentation: https://github.com/jaycarson373-tech/hood-brokers

### Fee claims
HoodPonsV2FundingAdapter and its Solidity tests. Tracks fee claims and funding by epoch.

Before live use: Bind Pons V2 escrow, curve, reward token, distributor, keeper, and treasury. Only direct reward-token pairs are supported.

Origin: Exact contracts/HoodBrokerRewards.sol from Hood Brokers, revision 93059ad.
Documentation: https://github.com/jaycarson373-tech/hood-brokers

## Shared foundation
The integer utility library is shared across kits. Snapshot/reward modules share the original keeper. Airdrop and claim modules share the original contract and its test suite.

## Verification
- Run npm install once, then commit package-lock.json. Use npm ci on subsequent installs. Direct dependency versions are pinned; the initial transitive resolution is locked on that first install.
- npm run verify checks source integrity, unit tests, any included Solidity tests (Foundry required), and the frontend build.
- npm run doctor checks the configured RPC chain ID and latest block. This is read-only and does not prove contracts are deployed.
- No credentials, live contract addresses, production workers, oracle services, or backend storage are inherited.

Project verification evidence is appended after every completed run. Unit and build success does not prove a live Pons launch or live rewards.

## Remaining live integration

1. Confirm the launch wallet is allowed to use Pons V2 immediately before launch. The preflight reads the factory's live `canLaunch` result and verifies that QQQ is still an approved pair token.
2. Approve the exact epoch duration, distribution share/cap, minimum payout, dust policy, and treasury policy. Absolute unrealized QQQ loss is implemented as the deterministic weighting factor but is not activated silently.
3. Choose owner, keeper, and treasury addresses; deploy and verify `TopblastDistributor` and `TopblastPonsV2FundingAdapter`; use the adapter as the Pons `creatorFeeRecipient` at launch.
4. Deploy the index and reward worker with the supplied Railway service definitions, persistent `/data` volumes, and private server-side secrets. Keep `EXECUTE_REWARDS=false`.
5. Launch Topblast through Pons V2 against QQQ, then supply the verified token CA and X URL. Curve, launch block, pair, decimals, market phase, fee recipient, and launch proof are now auto-discovered.
6. Add and verify post-graduation Uniswap v4 swap attribution and hook fee sweeping before the curve graduates. The worker pauses at graduation rather than presenting stale curve state as live.
7. Run the documented tiny real cycle and verify the buy, entry, below-entry state, fixed-block snapshot, QQQ fee sweep/claim, loss-weight payout, onchain receipt, UI history, and duplicate retry.
8. Keep reward automation paused until step 7 passes. No private key is needed for the read-only index; any keeper signer stays server-side only.

## Validation evidence

Recorded 2026-09-14:

- `npm test`: 25 passed, 0 failed.
- `forge test`: 4 passed, 0 failed, including duplicate-payout rejection and idempotent fee funding.
- `npm run build`: passed with Vite 8.2.2.
- `node --check server/indexer.mjs`: passed.
- `npm run doctor`: passed against Robinhood Chain mainnet, chain ID 4663, latest observed block 63115463. Read-only check; no transaction submitted.
- Vercel preview deployment `dpl_DJ1i6aZ66D23Xp47qTm2bz12aSRs`: READY. The preview is protected by the account's Vercel SSO and production was not replaced.
- `npm run verify:source` reports the intentional product changes in `src/style.css`, `src/wallet.mjs`, and `src/WalletPanel.jsx`. These are expected because the exported Mean Machine starter was converted into the Topblast UI. The inherited contract and keeper files remain unchanged and their original tests pass.
- Browser visual automation was unavailable in this environment. Responsive rules for desktop, 760px, and 390px were reviewed in source, but physical mobile gesture QA remains required before production promotion.

Recorded 2026-09-15:

- Corrected the live Pons V2 escrow integration in a project-specific adapter to `claimToken(address)`. The inherited source module remains unchanged.
- Removed curve address and launch block from the launch handoff. Both now come from the finalized `TokenLaunched` event and are checked against the factory record.
- Corrected chart marker times to the selected candle bucket while retaining exact execution time, execution price, quantities, and transaction proof.
- Added finalized fixed-block snapshots, token/quote decimal-safe entry math, reward receipts, server rate limiting, CORS allowlisting, stale-state handling, and reward-worker fail-closed validation.
- `npm test`: 32 tests passed after the final edge-case additions.
- `forge test`: 5 tests passed, including the deployed Pons V2 claim signature and duplicate-safe payout path.
- `npm run build`: passed.
- Vercel preview `dpl_EWRAq8MHsc1ZejceVPT8dwe321bS` reached READY at `https://burned-kd8s3gu81-jaycarson373-7760s-projects.vercel.app`; authenticated `vercel curl` returned the expected Topblast metadata and compiled assets. Production was not promoted.
- No live CA, X account, Pons V2 launch, deployed reward contracts, signer, or real QQQ fee cycle was available. No transaction was submitted.
- Added an atomic reward-worker journal and an onchain `latestFundedEpoch` recovery pointer. A worker restart now resumes a funded or active unfinished epoch instead of advancing to the newest epoch.
- Added live factory phase checks on every finalized rebuild. The curve index and reward path stop at graduation instead of continuing with stale curve reserves.
- Added separate Railway index and reward-worker Docker/config files and a prelaunch gate that checks the current Pons launcher permission, QQQ approval, role separation, secrets, reward policy, and contract bindings.
- `npm test`: 34 tests passed, including reward-journal restart and wrong-deployment rejection.
- `forge test`: 5 tests passed after adding the onchain funded-epoch recovery pointer.
- `npm run build`: passed. `npm run doctor`: passed at Robinhood Chain block 63692155. `npm run prelaunch`: 5/15 passed with no environment configured; it correctly identified the missing launch roles, policy, secrets, and reward contracts.
- Added safe startup wrappers: the index serves an honest `awaiting_configuration` health state without a CA, and the reward service stays disabled without complete signer/contract configuration. Both wrappers passed local health checks.
- Created and pushed the private GitHub repository `jaycarson373-tech/topblast-robinhood` at commit `fc64c09`.
- Staged the existing Railway Topblast services with Robinhood Chain/QQQ constants, persistent state paths, a shared internal API token, and reward execution disabled. Railway refused the source switch because the workspace trial is expired, so the existing services were left running unchanged.

Recorded 2026-09-18:

- Preserved the prior public tree at `checkpoint/topblast-blast-stonk-2026-09-14` and the pending Burned configuration edits on `checkpoint/pre-robinhood-overlay-2026-09-18`.
- Moved the complete Robinhood/Pons Topblast implementation onto the existing `BURNED-site` main tree. This is an intentional product replacement over the checkpoint, not a new Vercel project.
- Accepted the intentional Topblast interface, injected-wallet, and wallet-panel changes in `src/style.css`, `src/wallet.mjs`, and `src/WalletPanel.jsx`; their source-integrity fingerprints were refreshed only after the rationale and earlier validation evidence were recorded here.
- Railway billing was restored. The public index and private reward worker deployed successfully with persistent `/data` volumes. The index remains in `awaiting_configuration` and the worker remains disabled until the verified token, reward contracts, signer roles, and first reviewed real cycle exist.
- Reward policy staged at 70% of claimed QQQ for eligible positions and 30% retained by treasury. Live execution remains disabled and the per-epoch cap is still pending.
