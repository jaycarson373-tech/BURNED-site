# Topblast · BLAST / STONK

Existing verified-position product, rebranded with a graphite/lime identity. Static UI plus a read-only Stonk market quote endpoint. No signing secrets or service-role keys belong in the frontend.

## Run

`npm run dev` serves http://127.0.0.1:5181.

`npm test` runs Node tests. `npm run build` checks public branding, anchors, assets and isolated launch configuration, then writes dist.

## Configuration

Copy values from vercel-variables.example into the deployment environment after verifying the new market. A blank BLAST mint is intentional before verification. Prior market environment variables do not enable this one.

The primary chart and wallet map use the worker's canonical price and account state. Price history can be persisted with supabase/blast-price-history.sql; otherwise actual epoch snapshots and newly observed canonical prices are used. The secondary STONK chart is separate market context.

See LAUNCH-STATUS.md for completed work, retained internal identifiers, required launch configuration and unverified checks. Airdrops remain paused. The existing worker repository retains legacy BURNED/EMBER database field names for compatibility.
