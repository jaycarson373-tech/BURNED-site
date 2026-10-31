# Topblast Pump production configuration

The site and worker bind to one verified Pump mint. Signing secrets remain on
Railway. Never place a private key in Vercel, Supabase, source control or chat.

## Railway reward worker

Configure the existing `rewards-worker` service:

```dotenv
SERVICE_MODE=worker
TOPBLAST_PUMP_ONLY=true
TOPBLAST_TOKEN_MINT=VERIFIED_PUMP_MINT
TOPBLAST_TREASURY_ADDRESS=MATCHING_PUBLIC_WALLET
TREASURY_PRIVATE_KEY=RAILWAY_SEALED_SECRET
SUPABASE_URL=EXISTING_PROJECT_URL
SUPABASE_SERVICE_ROLE_KEY=RAILWAY_SEALED_SECRET
SOLANA_RPC_URL=HELIUS_PREMIUM_MAINNET_RPC_URL
PUMP_TRACKING_MODE=rpc_polling
PUMPFUN_ENABLED=true
PAYOUT_MODE=server_signer
DRY_RUN=false
TOPBLAST_ENABLE_LIVE_REWARDS=true
REWARD_EPOCH_SECONDS=900
REWARD_WORKER_POLL_SECONDS=30
TOPBLAST_MAX_PAYOUT_ATOMS=EXPLICIT_POSITIVE_SOL_LAMPORT_CAP
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
PUBLIC_BLAST_REWARD_MINT=So11111111111111111111111111111111111111112
BLAST_PROJECT_ID=topblast-pump-v1
BLAST_INDEX_VERIFIED=true
BLAST_MARKET_VERIFIED=true
BLAST_REWARDS_ACTIVE=true
PUBLIC_BLAST_SUPABASE_URL=PUBLIC_SUPABASE_PROJECT_URL
PUBLIC_BLAST_SUPABASE_KEY=PUBLISHABLE_OR_ANON_KEY
PUBLIC_BLAST_X_URL=https://x.com/TopblastStonk
PUBLIC_BLAST_SITE_URL=https://topblast.xyz
```

The site contains no signing key and cannot choose reward amounts. It reads the
canonical public views produced by the worker and displays only finalized buys,
positions, completed epochs and confirmed distribution signatures.

## Activation evidence

Before treating payouts as live, confirm one real buy, its weighted entry, a
completed underwater snapshot, a fee-funded epoch, a confirmed holder transfer,
the public receipt, and a worker restart that does not duplicate payment.
