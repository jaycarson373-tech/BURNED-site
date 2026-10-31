# Topblast Pump production configuration

The site and worker bind to one verified Pump mint. Signing secrets remain on
Railway. Never place a private key in Vercel, Supabase, source control or chat.

**New launch policy:** 90% of applicable confirmed fees fund eligible holder
rewards; 10% fund TOPBLAST buyback and burn. The PUMP-specific accounting and
execution code is staged on `topblast-pump-v2-staged`. Apply both PUMP fee-bucket
migrations, including `202610310002_topblast_pump_90_10.sql`, before configuring
that profile. Existing immutable launches and historical receipts retain their
original allocation. Live activation still requires a verified new mint and a
real fee-funded reward cycle. Do not activate the old mint or reuse its records.

## Railway reward worker

Configure the existing `rewards-worker` service:

```dotenv
SERVICE_MODE=worker
TOPBLAST_PUMP_ONLY=true
TOPBLAST_PUMP_V2_ENABLED=true
TOPBLAST_PUMP_BUYBACKS_ENABLED=false
TOPBLAST_MAX_BUYBACK_ATOMS=EXPLICIT_POSITIVE_PUMP_BASE_UNIT_CAP
TOPBLAST_MIN_BUYBACK_ATOMS=EXPLICIT_POSITIVE_PUMP_BASE_UNIT_MINIMUM
TOPBLAST_TOKEN_MINT=VERIFIED_PUMP_MINT
TOPBLAST_TREASURY_ADDRESS=MATCHING_PUBLIC_WALLET
TREASURY_PRIVATE_KEY=RAILWAY_SEALED_SECRET
SUPABASE_URL=EXISTING_PROJECT_URL
SUPABASE_SERVICE_ROLE_KEY=RAILWAY_SEALED_SECRET
SOLANA_RPC_URL=HELIUS_PREMIUM_MAINNET_RPC_URL
PUMP_TRACKING_MODE=rpc_polling
PUMPFUN_ENABLED=true
PAYOUT_MODE=server_signer
DRY_RUN=true
TOPBLAST_ENABLE_LIVE_REWARDS=false
REWARD_EPOCH_SECONDS=900
REWARD_WORKER_POLL_SECONDS=10
TOPBLAST_MAX_PAYOUT_ATOMS=EXPLICIT_POSITIVE_PUMP_BASE_UNIT_CAP
```

The private key must derive `TOPBLAST_TREASURY_ADDRESS`. The worker refuses a
mismatch. It verifies the Pump creation transaction, creator, bonding curve,
quote mint and decimals before registering the market. `TOPBLAST_LAUNCH_SIGNATURE`
is optional and should be the finalized creation signature only when automatic
history discovery cannot reach it.

## Public site

After the worker has registered and backfilled that exact mint, set these public
Vercel values and redeploy:

```dotenv
PUBLIC_BLAST_MINT=THE_SAME_VERIFIED_PUMP_MINT
PUBLIC_BLAST_REWARD_MINT=pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn
BLAST_PROJECT_ID=topblast-pump-v1
BLAST_INDEX_VERIFIED=false
BLAST_MARKET_VERIFIED=false
BLAST_REWARDS_ACTIVE=false
PUBLIC_BLAST_SUPABASE_URL=PUBLIC_SUPABASE_PROJECT_URL
PUBLIC_BLAST_SUPABASE_KEY=PUBLISHABLE_OR_ANON_KEY
PUBLIC_BLAST_X_URL=https://x.com/Topblast_xyz_
PUBLIC_BLAST_SITE_URL=https://topblast.xyz
```

The site contains no signing key and cannot choose reward amounts. It reads the
canonical public views produced by the worker and displays only finalized buys,
positions, completed epochs and confirmed distribution signatures.
The PUMP mint has six decimals and uses Token-2022. The frontend rejects a
different reward mint; the market quote must independently match this mint.

## Activation evidence

Keep buybacks and live rewards disabled during configuration. Before treating payouts as live, confirm one real buy, its weighted entry, a
completed underwater snapshot, a fee-funded epoch, a confirmed holder transfer,
the public receipt, and a worker restart that does not duplicate payment.
