import assert from "node:assert/strict";
import test from "node:test";
import { getAddress, id, toBeHex, zeroPadValue } from "ethers";
import { allocateEqualReward, buildSnapshot, rewardScheduleAtOrBefore, unpaidBatches } from "./core.mjs";

test("reward schedule is deterministic and every interval stays within 4–8 hours", () => {
  const parameters = {
    anchorTimestampSeconds: 1_800_000_000,
    minimumSeconds: 14_400,
    maximumSeconds: 28_800,
    seed: "4663:0x0000000000000000000000000000000000000463",
  };
  const first = rewardScheduleAtOrBefore({ ...parameters, timestampSeconds: parameters.anchorTimestampSeconds });
  const repeated = rewardScheduleAtOrBefore({ ...parameters, timestampSeconds: parameters.anchorTimestampSeconds });
  assert.deepEqual(first, repeated);
  let previous = parameters.anchorTimestampSeconds;
  let dueAt = first.nextScheduledTimestamp;
  for (let expectedEpoch = 1n; expectedEpoch <= 50n; expectedEpoch += 1n) {
    const schedule = rewardScheduleAtOrBefore({ ...parameters, timestampSeconds: dueAt });
    assert.equal(schedule.epochId, expectedEpoch);
    const interval = schedule.scheduledTimestamp - previous;
    assert.ok(interval >= parameters.minimumSeconds && interval <= parameters.maximumSeconds);
    previous = schedule.scheduledTimestamp;
    dueAt = schedule.nextScheduledTimestamp;
  }
});

test("reward schedule exposes the first future boundary before any epoch is due", () => {
  const schedule = rewardScheduleAtOrBefore({
    timestampSeconds: 1_800_000_001,
    anchorTimestampSeconds: 1_800_000_000,
    minimumSeconds: 14_400,
    maximumSeconds: 28_800,
    seed: "hood-brokers",
  });
  assert.equal(schedule.epochId, 0n);
  assert.equal(schedule.scheduledTimestamp, null);
  assert.ok(schedule.nextScheduledTimestamp >= 1_800_014_400);
  assert.ok(schedule.nextScheduledTimestamp <= 1_800_028_800);
});

const address = (suffix) => getAddress(`0x${suffix.padStart(40, "0")}`);
const topicAddress = (value) => zeroPadValue(value, 32);
const transfer = (blockNumber, index, from, to, tokenId) => ({
  blockNumber: BigInt(blockNumber),
  transactionIndex: 0,
  index,
  topics: [id("Transfer(address,address,uint256)"), topicAddress(from), topicAddress(to), zeroPadValue(toBeHex(tokenId), 32)],
});

test("fixed-block NFT snapshot aggregates one unit per token and records exclusions", async () => {
  const nft = address("99");
  const walletA = address("a1");
  const walletB = address("b2");
  const denied = address("d3");
  const contractWallet = address("c4");
  const logs = [
    transfer(10, 0, address("0"), walletA, 1),
    transfer(11, 0, address("0"), walletA, 2),
    transfer(12, 0, address("0"), walletB, 3),
    transfer(13, 0, walletB, denied, 3),
    transfer(14, 0, address("0"), contractWallet, 4),
    transfer(16, 0, walletA, walletB, 2),
  ];
  const provider = {
    async getLogs(filter) {
      return logs.filter((row) => Number(row.blockNumber) >= filter.fromBlock && Number(row.blockNumber) <= filter.toBlock);
    },
    async getCode(who) {
      return who === contractWallet ? "0x6000" : "0x";
    },
  };
  const snapshot = await buildSnapshot({
    provider, chainId: 4663, nftAddress: nft, startBlock: 10, snapshotBlock: 15,
    blockSpan: 2, denyAddresses: [denied],
  });
  assert.deepEqual(snapshot.eligible.map((row) => [row.wallet, row.nftCount, row.tokenIds]), [[walletA, 2, [1, 2]]]);
  assert.equal(snapshot.eligibleNftCount, 2);
  assert.equal(snapshot.eligibleWalletCount, 1);
  assert.equal(snapshot.excludedNftCount, 2);
  assert.deepEqual(snapshot.exclusions.map((row) => row.reason).sort(), ["configured_exclusion", "contract_not_allowlisted"]);
  assert.match(snapshot.snapshotHash, /^0x[0-9a-f]{64}$/);
});

test("equal NFT weights conserve the distributable pool and roll dust forward", () => {
  const rows = [
    { wallet: address("a1"), nftCount: 2, tokenIds: [1, 2] },
    { wallet: address("b2"), nftCount: 1, tokenIds: [3] },
    { wallet: address("c3"), nftCount: 1, tokenIds: [4] },
  ];
  const result = allocateEqualReward(103n, rows);
  assert.equal(result.perNftRaw, 25n);
  assert.equal(result.distributionTotalRaw, 100n);
  assert.equal(result.roundingDustRaw, 3n);
  assert.deepEqual(result.allocations.map((row) => row.rewardAmountRaw), [50n, 25n, 25n]);
});

test("restart planning preserves original batch sequence and never repays a wallet", () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({
    wallet: address((index + 1).toString(16)), nftCount: 1, tokenIds: [index + 1], rewardAmountRaw: 10n,
  }));
  const batches = unpaidBatches(rows, new Set([rows[0].wallet, rows[3].wallet]), 2);
  assert.deepEqual(batches.map((batch) => [batch.sequence, batch.recipients.map((row) => row.wallet)]), [
    [0, [rows[1].wallet]],
    [1, [rows[2].wallet]],
    [2, [rows[4].wallet]],
  ]);
  assert.deepEqual(unpaidBatches(rows, new Set(rows.map((row) => row.wallet)), 2), []);
});
