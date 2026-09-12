# TOP BLAST site

The public Vercel site for $TOPBLAST / $RAY on Stonk Fun.

## Product behavior

The hero contains the live TOP BLAST chart and Blast Zone. Without a verified production index it shows honest unavailable states and no sample wallet, price, reward, or transaction data. With the public index connected it shows canonical RAY-denominated prices, verified buys, tracked entries, Blast Zone positions, loss-ranked wallets, epoch metrics, wallet history, and confirmed RAY airdrop transactions.

TOP BLAST uses Stonk Fun Standard Mode with the 2% pool tier. Stonk Fun assigns 1.5% of each trade to the creator fee position and 0.5% to the platform. The custom reward engine credits only finalized RAY fee claims, allocates 80% to eligible underwater positions by measured unrealized RAY loss, and retains 20% in treasury. Epochs close every 900 seconds; onchain confirmation may follow later.

## Production configuration

Configure these variables in Vercel:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `TOPBLAST_PROJECT_ID=topblast`
- `PUBLIC_TOPBLAST_MINT` after the production mint is verified
- `PUBLIC_DEXSCREENER_URL` after the production pool exists
- `PUBLIC_X_URL=https://x.com/topblastdotxyz`

Never configure a signing secret or Supabase service-role key in Vercel.

## Local checks

```sh
npm test
npm run build
```
