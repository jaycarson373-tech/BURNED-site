# TOP BLAST site

The public Vercel site for $TOPBLAST / $EMBER.

[Import this repository into Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fjaycarson373-tech%2FBURNED-site)

The hero contains the TOP BLAST chart and Blast Zone. Without a connected index it displays a labeled mechanic preview and no live values. With the public Supabase index connected it displays finalized prices, verified buys, tracked Blast Zone wallets, wallet positions, and settled $EMBER airdrops.

The database still uses legacy table and field names for migration compatibility. Those identifiers do not change public branding or token behavior.

## Vercel settings

Keep the repository root as the Root Directory. `vercel.json` supplies the build command and `dist` output directory.

Add these values to the Production environment:

```text
PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
TOPBLAST_PROJECT_ID=toplast
```

The project ID remains `toplast` for existing indexed rows. Only the Supabase publishable key belongs here. Never add the Supabase secret key, Helius key, treasury key, or signer configuration to Vercel.

## Local preview

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run dev
```

The backend worker and Supabase schema live in the private worker repository. Public launch copy is in `PUBLIC-COPY.md`.
