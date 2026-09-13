# BURNED site

The BURNED / EMBER rebrand of the existing site. The structure, wallet lookup, canonical entry display and activity feed are preserved. Warm ivory, charcoal and a new orange flame identity replace the prior navy comet branding.

## Current state

The website is a relaunch preview. Payouts remain stopped. No worker, contracts, signing keys, balances, cost-basis math or reward allocation rules were changed in this frontend pass. The intended cadence remains approximately 15 minutes, not a promise of an active scheduler.

The Burn Zone has a manually controlled, labelled mechanic illustration. It does not populate wallet data, price history, reward totals or eligibility. Live values stay unavailable until the new market is verified. Prior TOPBLAST/RAY data is never relabelled as BURNED/EMBER.

## New public configuration

These BURNED-specific variables deliberately do not inherit old TOPBLAST settings:

- `PUBLIC_BURNED_MINT`: verified new BURNED Solana mint
- `PUBLIC_BURNED_EMBER_MINT`: verified EMBER quote/reward mint
- `PUBLIC_BURNED_SUPABASE_URL`: isolated public index endpoint
- `PUBLIC_BURNED_SUPABASE_KEY`: publishable or anon key only
- `BURNED_PROJECT_ID=burned-ember`: isolated dataset matching the worker
- `BURNED_INDEX_VERIFIED=true`: only after mint, pool, quote, index and canonical price checks pass
- `BURNED_REWARDS_ACTIVE=true`: display flag only, set only after payouts are actually running; it does not enable the worker
- `PUBLIC_BURNED_X_URL`: verified new profile, optional

Never put private keys or a service-role key in public build variables. Internal `topblastMint`, `TopBlastIndex`, DOM selectors and legacy `toplast_*` database table names remain compatibility identifiers. They do not change economic state.

## Remaining relaunch work

Verify the new token metadata, Ember pool and fee path. Configure a separate worker/index namespace and verify matching frontend price and entry. Prove a small real EMBER reward cycle before enabling recurring payouts. Existing RAY payouts are historical and do not prove this new launch is configured.

## Checks

`npm test` and `npm run build`. Browser QA covers responsive layout, wallet input, mechanic preview switching, unavailable values and no client errors. No chain transaction is part of this rebrand.

## Assets

`public/burned-logo.png`, `public/favicon-burned.png`, `public/apple-touch-icon-burned.png`, `public/burned-banner.png`. The banner is a social asset and OpenGraph image; no large banner section was added to the page.
