# TOP BLAST site

The public Vercel site for $TOPBLAST / $QQQx on Stonk Fun.

## Product behavior

The hero contains the TOP BLAST chart and Blast Zone. Without a connected production index it displays honest unavailable states and no sample wallet, price, reward, or transaction data. With the public index connected it displays canonical prices, verified buys, tracked entries, Blast Zone positions, wallet history, and confirmed QQQx reward transactions.

Stonk Fun Reward Mode uses a permanent 3% Token-2022 transfer tax. The protocol distributes rewards automatically in QQQx to holders. Blast Zone tracking is a separate product view and does not determine protocol reward eligibility.

## Production configuration

Configure these variables in Vercel:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `TOPBLAST_PROJECT_ID=topblast`
- `PUBLIC_TOPBLAST_MINT` after the production mint is verified
- `PUBLIC_DEXSCREENER_URL` after the production pool exists
- `PUBLIC_X_URL=https://x.com/topblastdotxyz`

Never configure a private key or Supabase service-role key in Vercel.

## Local checks

```sh
npm test
npm run build
```
