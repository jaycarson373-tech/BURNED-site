// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IFeeEscrow {
    function balanceOfToken(address recipient, address token) external view returns (uint256);
    function claimToken(address token, uint256 amount) external returns (uint256);
}

interface IPonsV2Curve {
    function sweepFees(uint256 minBuybackTokensOut) external;
}

/// @notice Batched direct airdrops committed to an immutable NFT ownership snapshot.
/// @dev The paid mapping is the onchain restart/idempotency boundary inherited from Ponsi.
contract HoodBrokerDistributor is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable rewardToken;
    address public keeper;
    uint256 public activeEpochId;
    mapping(uint256 => bool) public epochFinished;
    mapping(uint256 => uint256) public epochReward;
    mapping(uint256 => uint256) public epochDistributed;
    mapping(uint256 => bytes32) public snapshotHash;
    mapping(uint256 => mapping(address => bool)) public paid;

    error UnauthorizedKeeper();
    error InvalidConfiguration();
    error InvalidEpoch();
    error InvalidBatch();
    error InvalidPayout();
    error AlreadyPaid();
    error InsufficientFunding();
    error Overspend();
    error IncompleteEpoch();

    event KeeperUpdated(address indexed keeper);
    event EpochStarted(
        uint256 indexed epochId,
        uint256 snapshotBlock,
        bytes32 indexed snapshotHash,
        uint256 rewardAmount,
        uint256 eligibleNfts,
        uint256 eligibleWallets
    );
    event BatchDistributed(uint256 indexed epochId, uint256 indexed sequence, uint256 recipientCount, uint256 amount);
    event EpochFinished(uint256 indexed epochId, uint256 distributedAmount);

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert UnauthorizedKeeper();
        _;
    }

    constructor(address rewardToken_, address initialOwner, address keeper_) Ownable(initialOwner) {
        if (rewardToken_.code.length == 0 || initialOwner == address(0) || keeper_ == address(0)) {
            revert InvalidConfiguration();
        }
        rewardToken = IERC20(rewardToken_);
        keeper = keeper_;
    }

    function setKeeper(address keeper_) external onlyOwner {
        if (keeper_ == address(0)) revert InvalidConfiguration();
        keeper = keeper_;
        emit KeeperUpdated(keeper_);
    }

    function startEpoch(
        uint256 epochId,
        uint256 snapshotBlock,
        bytes32 snapshotHash_,
        uint256 rewardAmount,
        uint256 eligibleNfts,
        uint256 eligibleWallets
    ) external onlyKeeper {
        if (activeEpochId != 0 || epochId == 0 || epochFinished[epochId] || snapshotHash_ == bytes32(0)) {
            revert InvalidEpoch();
        }
        if (rewardAmount == 0 || eligibleNfts == 0 || eligibleWallets == 0) revert InvalidConfiguration();
        if (rewardToken.balanceOf(address(this)) < rewardAmount) revert InsufficientFunding();
        activeEpochId = epochId;
        epochReward[epochId] = rewardAmount;
        snapshotHash[epochId] = snapshotHash_;
        emit EpochStarted(epochId, snapshotBlock, snapshotHash_, rewardAmount, eligibleNfts, eligibleWallets);
    }

    function distributeBatch(
        uint256 epochId,
        uint256 sequence,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyKeeper nonReentrant {
        if (activeEpochId != epochId || recipients.length == 0 || recipients.length != amounts.length) {
            revert InvalidBatch();
        }
        uint256 batchTotal;
        for (uint256 i; i < recipients.length; ++i) {
            address recipient = recipients[i];
            uint256 amount = amounts[i];
            if (recipient == address(0) || amount == 0) revert InvalidPayout();
            if (paid[epochId][recipient]) revert AlreadyPaid();
            paid[epochId][recipient] = true;
            batchTotal += amount;
            rewardToken.safeTransfer(recipient, amount);
        }
        epochDistributed[epochId] += batchTotal;
        if (epochDistributed[epochId] > epochReward[epochId]) revert Overspend();
        emit BatchDistributed(epochId, sequence, recipients.length, batchTotal);
    }

    function finishEpoch(uint256 epochId) external onlyKeeper {
        if (activeEpochId != epochId) revert InvalidEpoch();
        if (epochDistributed[epochId] != epochReward[epochId]) revert IncompleteEpoch();
        activeEpochId = 0;
        epochFinished[epochId] = true;
        emit EpochFinished(epochId, epochDistributed[epochId]);
    }
}

/// @notice Pons V2 custom-pair fee adapter for Hood Brokers reward epochs.
/// @dev Hood launches directly against the reward token, so creator fees are claimed
/// in that same ERC20 and forwarded without a router or conversion step.
contract HoodPonsV2FundingAdapter is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable rewardToken;
    address public immutable distributor;
    address public keeper;
    address public immutable treasury;
    IFeeEscrow public immutable feeEscrow;
    mapping(uint256 => uint256) public epochFunding;
    mapping(uint256 => uint256) public epochSweepClaimable;
    mapping(uint256 => uint256) public epochClaimedReward;

    error UnauthorizedKeeper();
    error InvalidConfiguration();
    error NoNewFees();
    error ClaimFailed();

    event RewardFeesClaimed(uint256 indexed epochId, address indexed token, uint256 amount);
    event CreatorFeesSwept(
        uint256 indexed epochId, address indexed curve, address indexed token, uint256 claimableAmount
    );
    event KeeperUpdated(address indexed keeper);
    event EpochFunded(uint256 indexed epochId, uint256 distributorAmount, uint256 treasuryAmount);

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert UnauthorizedKeeper();
        _;
    }

    constructor(
        address rewardToken_,
        address distributor_,
        address initialOwner,
        address keeper_,
        address treasury_,
        address feeEscrow_
    ) Ownable(initialOwner) {
        if (
            rewardToken_.code.length == 0 || distributor_.code.length == 0 || initialOwner == address(0)
                || keeper_ == address(0) || treasury_ == address(0) || feeEscrow_.code.length == 0
        ) revert InvalidConfiguration();
        rewardToken = IERC20(rewardToken_);
        distributor = distributor_;
        keeper = keeper_;
        treasury = treasury_;
        feeEscrow = IFeeEscrow(feeEscrow_);
    }

    function setKeeper(address keeper_) external onlyOwner {
        if (keeper_ == address(0)) revert InvalidConfiguration();
        keeper = keeper_;
        emit KeeperUpdated(keeper_);
    }

    function claimableReward() external view returns (uint256) {
        return feeEscrow.balanceOfToken(address(this), address(rewardToken));
    }

    /// @notice Moves pending curve fees into escrow from the adapter identity.
    /// @dev Pons V2 restricts fee sweeping to the configured fee-sweep operator,
    /// which is this adapter. The epoch mapping makes keeper restarts idempotent.
    function sweepCreatorFees(uint256 epochId, address curve)
        external
        onlyKeeper
        nonReentrant
        returns (uint256 claimableAfter)
    {
        if (epochId == 0 || curve.code.length == 0) revert InvalidConfiguration();
        claimableAfter = epochSweepClaimable[epochId];
        if (claimableAfter != 0) return claimableAfter;
        IPonsV2Curve(curve).sweepFees(0);
        claimableAfter = feeEscrow.balanceOfToken(address(this), address(rewardToken));
        epochSweepClaimable[epochId] = claimableAfter;
        emit CreatorFeesSwept(epochId, curve, address(rewardToken), claimableAfter);
    }

    function fundEpoch(uint256 epochId, address recipient, uint16 distributionBps, uint256 maxAmount)
        external
        onlyKeeper
        nonReentrant
        returns (uint256 fundedAmount)
    {
        if (epochId == 0 || recipient != distributor || distributionBps == 0 || distributionBps > 10_000) {
            revert InvalidConfiguration();
        }
        fundedAmount = epochFunding[epochId];
        if (fundedAmount != 0) return fundedAmount;

        uint256 claimable = feeEscrow.balanceOfToken(address(this), address(rewardToken));
        if (claimable == 0) revert NoNewFees();
        _claim(epochId, claimable);

        fundedAmount = Math.mulDiv(claimable, distributionBps, 10_000);
        if (maxAmount != 0 && fundedAmount > maxAmount) fundedAmount = maxAmount;
        if (fundedAmount == 0) revert InvalidConfiguration();
        epochFunding[epochId] = fundedAmount;
        rewardToken.safeTransfer(distributor, fundedAmount);
        uint256 treasuryAmount = claimable - fundedAmount;
        if (treasuryAmount != 0) rewardToken.safeTransfer(treasury, treasuryAmount);
        emit EpochFunded(epochId, fundedAmount, treasuryAmount);
    }

    function _claim(uint256 epochId, uint256 claimable) private {
        uint256 rewardBefore = rewardToken.balanceOf(address(this));
        if (
            feeEscrow.claimToken(address(rewardToken), claimable) != claimable
                || rewardToken.balanceOf(address(this)) != rewardBefore + claimable
        ) {
            revert ClaimFailed();
        }
        epochClaimedReward[epochId] = claimable;
        emit RewardFeesClaimed(epochId, address(rewardToken), claimable);
    }
}
