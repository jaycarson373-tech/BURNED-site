# Topblast launch runbook

## One-time setup before the token launch

1. Choose separate owner, keeper, and treasury addresses. Keep the keeper key only in the private reward-worker service.
2. Approve the exact epoch length, QQQ distribution percentage, cap, dust policy, and minimum eligible loss. The code does not invent those economics.
3. Review and deploy `TopblastDistributor` and `TopblastPonsV2FundingAdapter` with `npm run deploy:rewards`. Deployment is transaction-gated by `DEPLOY_REWARDS=true`.
4. Use the deployed funding-adapter address as `creatorFeeRecipient` in the Pons V2 launch. Without this, the adapter cannot sweep and claim the creator's QQQ fees automatically.
5. Deploy the index service with a persistent `/data` volume. Set `RH_RPC_URL`, `VITE_INDEX_URL`/`INDEX_URL`, `INTERNAL_API_TOKEN`, CORS, and the reward contract addresses.
6. Deploy the reward worker with `EXECUTE_REWARDS=false`. Its startup validation checks chain ID, contract bytecode, QQQ binding, keeper ownership, index token, pair, and creator fee recipient.

### Railway services

Create two Railway services from this repository. For the index service set `RAILWAY_CONFIG_FILE=railway.index.toml`. For the reward worker set `RAILWAY_CONFIG_FILE=railway.rewards.toml`. Attach a persistent volume at `/data` to both services. The index persists finalized ingestion state there. The reward worker persists its pending epoch there and also recovers a funded unfinished epoch from `latestFundedEpoch` onchain after a restart.

The index service needs a public domain. Keep the reward worker private. Do not add `KEEPER_PRIVATE_KEY`, `INTERNAL_API_TOKEN`, or any owner/deployer key to Vercel.

Before the Pons launch, run `npm run prelaunch` with `LAUNCHER_ADDRESS` set. It checks the live Pons access gate, QQQ approval, role separation, server-only secrets, reward settings, and deployed reward-contract bindings without needing a token CA. Launch with buyback disabled and set the funding adapter as `creatorFeeRecipient`; the direct sweep path rejects any other setup.

## Two-input launch handoff

After the token transaction finalizes:

```sh
npm run configure:launch -- 0xYOUR_TOPBLAST_TOKEN https://x.com/YOUR_ACCOUNT
```

The command refuses an unrelated token, wrong ticker, wrong pair, unfinalized launch, or non-Pons V2 token. It writes `.launch.generated.env` with the only launch-specific public inputs and records the discovered curve and launch proof.

Apply `TOPBLAST_TOKEN_ADDRESS` to the index and reward services. Apply `VITE_TOPBLAST_TOKEN_ADDRESS` and `VITE_X_URL` to the frontend. Redeploy, then run:

```sh
npm run preflight
```

Do not enable execution unless every check passes.

## First real cycle

1. Make a tiny controlled verified buy.
2. Confirm the buy appears once on the chart and in the tape after finality.
3. Confirm the wallet entry equals `quoteIn / tokensOut` and a second buy updates the weighted average.
4. Confirm incoming transfers add no basis and a sell or send excludes the wallet for that epoch.
5. Wait for a finalized below-entry snapshot and inspect the dry-run snapshot hash and loss-weight allocations.
6. Review the exact QQQ amount, then set `EXECUTE_REWARDS=true` for the tiny cycle.
7. Confirm fee sweep, escrow claim, funding, every `RewardPaid`, `EpochFinished`, wallet history, and duplicate retry behavior.

Keep automation disabled if the token has graduated until the Uniswap v4 index and post-graduation fee sweep path have been verified against the live pool.
