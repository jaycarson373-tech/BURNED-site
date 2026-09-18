import { AbiCoder, getAddress, id, keccak256, toUtf8Bytes } from "ethers";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
export const TRANSFER_TOPIC = id("Transfer(address,address,uint256)");

function topicAddress(topic) {
  return getAddress(`0x${topic.slice(-40)}`);
}

function scheduleIntervalSeconds(seed, epochId, minimumSeconds, maximumSeconds) {
  const span = BigInt(maximumSeconds - minimumSeconds + 1);
  const entropy = BigInt(keccak256(toUtf8Bytes(`${seed}:${epochId}`)));
  return minimumSeconds + Number(entropy % span);
}

export function rewardScheduleAtOrBefore({
  timestampSeconds,
  anchorTimestampSeconds,
  minimumSeconds,
  maximumSeconds,
  seed,
}) {
  if (
    !Number.isSafeInteger(timestampSeconds)
    || !Number.isSafeInteger(anchorTimestampSeconds)
    || !Number.isSafeInteger(minimumSeconds)
    || !Number.isSafeInteger(maximumSeconds)
    || minimumSeconds < 60
    || maximumSeconds < minimumSeconds
    || typeof seed !== "string"
    || !seed
  ) throw new Error("Invalid reward schedule");

  let epochId = 0n;
  let scheduledTimestamp = null;
  let nextScheduledTimestamp = anchorTimestampSeconds
    + scheduleIntervalSeconds(seed, 1n, minimumSeconds, maximumSeconds);
  while (nextScheduledTimestamp <= timestampSeconds) {
    epochId += 1n;
    scheduledTimestamp = nextScheduledTimestamp;
    nextScheduledTimestamp += scheduleIntervalSeconds(
      seed,
      epochId + 1n,
      minimumSeconds,
      maximumSeconds,
    );
    if (epochId > 1_000_000n) throw new Error("Reward schedule exceeds the supported epoch range");
  }
  return { epochId, scheduledTimestamp, nextScheduledTimestamp };
}

export async function readOwnershipAtBlock({ provider, nftAddress, startBlock, snapshotBlock, blockSpan = 2_000 }) {
  if (startBlock > snapshotBlock) throw new Error("NFT start block is after snapshot block");
  const owners = new Map();
  for (let fromBlock = startBlock; fromBlock <= snapshotBlock; fromBlock += blockSpan) {
    const toBlock = Math.min(snapshotBlock, fromBlock + blockSpan - 1);
    const logs = await provider.getLogs({
      address: nftAddress,
      topics: [TRANSFER_TOPIC],
      fromBlock,
      toBlock,
    });
    logs.sort((a, b) =>
      Number(a.blockNumber - b.blockNumber)
      || Number((a.transactionIndex ?? 0) - (b.transactionIndex ?? 0))
      || Number((a.index ?? 0) - (b.index ?? 0)));
    for (const log of logs) {
      if (log.topics.length !== 4) continue;
      const to = topicAddress(log.topics[2]);
      const tokenId = BigInt(log.topics[3]).toString();
      if (to.toLowerCase() === ZERO_ADDRESS) owners.delete(tokenId);
      else owners.set(tokenId, to);
    }
  }
  return owners;
}

export async function buildSnapshot({
  provider,
  chainId,
  nftAddress,
  startBlock,
  snapshotBlock,
  blockSpan,
  denyAddresses = [],
  contractAllowlist = [],
}) {
  const ownersByToken = await readOwnershipAtBlock({ provider, nftAddress, startBlock, snapshotBlock, blockSpan });
  const grouped = new Map();
  for (const [tokenId, owner] of ownersByToken) {
    const key = owner.toLowerCase();
    const row = grouped.get(key) ?? { wallet: getAddress(owner), tokenIds: [] };
    row.tokenIds.push(Number(tokenId));
    grouped.set(key, row);
  }
  const deny = new Set([ZERO_ADDRESS, BURN_ADDRESS, ...denyAddresses].map((value) => value.toLowerCase()));
  const allowContracts = new Set(contractAllowlist.map((value) => value.toLowerCase()));
  const eligible = [];
  const exclusions = [];
  for (const row of [...grouped.values()].sort((a, b) => a.wallet.toLowerCase().localeCompare(b.wallet.toLowerCase()))) {
    row.tokenIds.sort((a, b) => a - b);
    const wallet = row.wallet.toLowerCase();
    let reason = "";
    if (deny.has(wallet)) reason = wallet === BURN_ADDRESS.toLowerCase() ? "burn_address" : "configured_exclusion";
    else if (!allowContracts.has(wallet)) {
      // Ownership is reconstructed at snapshotBlock. Receiver capability is a
      // current safety check so the keeper does not require an archive RPC.
      const code = await provider.getCode(row.wallet);
      if (code && code !== "0x") reason = "contract_not_allowlisted";
    }
    const output = { wallet: row.wallet, nftCount: row.tokenIds.length, tokenIds: row.tokenIds };
    (reason ? exclusions : eligible).push(reason ? { ...output, reason } : output);
  }
  const eligibleNftCount = eligible.reduce((sum, row) => sum + row.nftCount, 0);
  const excludedNftCount = exclusions.reduce((sum, row) => sum + row.nftCount, 0);
  const canonical = JSON.stringify({
    chainId: String(chainId),
    nftContract: getAddress(nftAddress),
    snapshotBlock,
    owners: eligible.map((row) => [row.wallet.toLowerCase(), row.tokenIds]),
    exclusions: exclusions.map((row) => [row.wallet.toLowerCase(), row.reason, row.tokenIds]),
  });
  return {
    snapshotHash: keccak256(toUtf8Bytes(canonical)),
    eligible,
    exclusions,
    eligibleNftCount,
    eligibleWalletCount: eligible.length,
    excludedNftCount,
    canonical,
  };
}

export function allocateEqualReward(totalRewardRaw, holders) {
  const total = BigInt(totalRewardRaw);
  const eligibleNfts = holders.reduce((sum, row) => sum + BigInt(row.nftCount), 0n);
  if (total <= 0n || eligibleNfts <= 0n) throw new Error("Reward pool and eligible NFT count must be positive");
  const perNftRaw = total / eligibleNfts;
  if (perNftRaw === 0n) throw new Error("Reward pool is too small to allocate one raw unit per eligible NFT");
  const allocations = holders
    .map((row) => ({ ...row, rewardAmountRaw: perNftRaw * BigInt(row.nftCount) }))
    .sort((a, b) => a.wallet.toLowerCase().localeCompare(b.wallet.toLowerCase()));
  const distributionTotalRaw = perNftRaw * eligibleNfts;
  return {
    perNftRaw,
    allocations,
    distributionTotalRaw,
    roundingDustRaw: total - distributionTotalRaw,
  };
}

export function unpaidBatches(allocations, paidWallets, batchSize) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new Error("Invalid batch size");
  const paid = new Set([...paidWallets].map((wallet) => wallet.toLowerCase()));
  const batches = [];
  for (let offset = 0; offset < allocations.length; offset += batchSize) {
    const recipients = allocations
      .slice(offset, offset + batchSize)
      .filter((row) => row.rewardAmountRaw > 0n && !paid.has(row.wallet.toLowerCase()));
    if (recipients.length) batches.push({ sequence: offset / batchSize, recipients });
  }
  return batches;
}

export function snapshotIdempotencyKey(chainId, nftAddress, epochId) {
  return keccak256(AbiCoder.defaultAbiCoder().encode(
    ["uint256", "address", "uint256"],
    [BigInt(chainId), getAddress(nftAddress), BigInt(epochId)],
  ));
}
