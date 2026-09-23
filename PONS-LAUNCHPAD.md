# Topblast PONS V2 layer

## Implemented

- The existing market terminal remains unchanged beneath a modal PONS launch layer.
- Connects only through an injected EVM wallet. No private key is accepted by the browser.
- Switches to Robinhood Chain mainnet, chain ID 4663.
- Uses the verified PONS V2 factory `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`.
- Reads `canLaunch`, live launch configurations, the launch fee, and the maximum creator tax directly from the factory.
- Native ETH is the default quote. Custom ERC-20 quotes must pass PONS approval and economics checks.
- Calls `previewLaunchEconomics` immediately before submission and passes the returned economics pin into `launchToken`.
- Uses a fresh cryptographic salt for every submission.
- Shows the confirmed Robinhood Chain transaction on Blockscout.

## Operating boundary

PONS controls its launch gate. A connected wallet cannot submit unless `canLaunch(wallet)` is true and at least one live launch configuration is enabled. A mainnet read on 2026-09-23 returned one enabled configuration and an open launch gate. The interface still rechecks the connected wallet immediately before offering submission.

This layer launches a standard PONS V2 token. It does not deploy Topblast's separate reward distributor or convert the existing Solana index into an EVM index. Those integrations require the confirmed token, curve, quote asset, launch block, reward policy and deployed reward contracts.
