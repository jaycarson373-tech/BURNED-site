// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {HoodBrokerDistributor, HoodPonsV2FundingAdapter} from "../contracts/HoodBrokerRewards.sol";

contract RewardTokenMock is ERC20 {
    constructor() ERC20("Reward", "RWD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract FeeEscrowMock {
    mapping(address => mapping(address => uint256)) public balanceOfToken;

    function depositFor(address recipient, address token, uint256 amount) external {
        ERC20(token).transferFrom(msg.sender, address(this), amount);
        balanceOfToken[recipient][token] += amount;
    }

    function claimToken(address token, uint256 amount) external returns (uint256) {
        require(balanceOfToken[msg.sender][token] >= amount, "BALANCE");
        balanceOfToken[msg.sender][token] -= amount;
        ERC20(token).transfer(msg.sender, amount);
        return amount;
    }
}

contract CurveMock {
    FeeEscrowMock public immutable escrow;
    RewardTokenMock public immutable token;
    address public operator;
    uint256 public quoteFeeBalance;

    constructor(FeeEscrowMock escrow_, RewardTokenMock token_) {
        escrow = escrow_;
        token = token_;
    }

    function setOperator(address operator_) external {
        require(operator == address(0), "OPERATOR_SET");
        operator = operator_;
    }

    function seedFees(uint256 amount) external {
        token.mint(address(this), amount);
        quoteFeeBalance += amount;
    }

    function creatorTaxBalance() external pure returns (uint256) {
        return 0;
    }

    function sweepFees(uint256) external {
        require(msg.sender == operator, "OPERATOR");
        uint256 amount = quoteFeeBalance;
        quoteFeeBalance = 0;
        token.approve(address(escrow), amount);
        escrow.depositFor(msg.sender, address(token), amount);
    }
}

contract HoodBrokerRewardsTest {
    RewardTokenMock token;
    FeeEscrowMock escrow;
    CurveMock curve;
    HoodBrokerDistributor distributor;
    HoodPonsV2FundingAdapter adapter;
    address treasury = address(0x777);

    receive() external payable {}

    function setUp() public {
        token = new RewardTokenMock();
        escrow = new FeeEscrowMock();
        distributor = new HoodBrokerDistributor(address(token), address(this), address(this));
        adapter = new HoodPonsV2FundingAdapter(
            address(token), address(distributor), address(this), address(this), treasury, address(escrow)
        );
        curve = new CurveMock(escrow, token);
        curve.setOperator(address(adapter));
    }

    function testAdapterOwnerCanRotateKeeper() public {
        adapter.setKeeper(address(0xBEEF));
        require(adapter.keeper() == address(0xBEEF), "keeper rotation");
    }

    function testAdapterSweepsAsConfiguredOperatorAndIsIdempotent() public {
        curve.seedFees(25);
        try curve.sweepFees(0) {
            revert("unauthorized direct sweep accepted");
        } catch {}

        uint256 claimable = adapter.sweepCreatorFees(3, address(curve));
        require(claimable == 25, "sweep amount");
        require(escrow.balanceOfToken(address(adapter), address(token)) == 25, "adapter escrow credit");
        require(adapter.epochSweepClaimable(3) == 25, "sweep proof");

        curve.seedFees(10);
        require(adapter.sweepCreatorFees(3, address(curve)) == 25, "restart result");
        require(
            escrow.balanceOfToken(address(adapter), address(token)) == 25 && curve.quoteFeeBalance() == 10,
            "duplicate sweep"
        );
    }

    function testAtomicFundingAndRestartSafeDistribution() public {
        token.mint(address(this), 150);
        token.approve(address(escrow), 150);
        escrow.depositFor(address(adapter), address(token), 100);
        uint256 funded = adapter.fundEpoch(1, address(distributor), 10_000, 0);
        require(funded == 100 && token.balanceOf(address(distributor)) == 100, "funding");
        require(adapter.epochClaimedReward(1) == 100, "proof");

        bytes32 hash = keccak256("snapshot");
        distributor.startEpoch(1, 123, hash, 100, 4, 3);
        address[] memory first = new address[](1);
        uint256[] memory firstAmount = new uint256[](1);
        first[0] = address(0xA1);
        firstAmount[0] = 50;
        distributor.distributeBatch(1, 0, first, firstAmount);
        try distributor.distributeBatch(1, 0, first, firstAmount) {
            revert("duplicate payment accepted");
        } catch {}

        address[] memory remaining = new address[](2);
        uint256[] memory remainingAmount = new uint256[](2);
        remaining[0] = address(0xB2);
        remaining[1] = address(0xC3);
        remainingAmount[0] = 25;
        remainingAmount[1] = 25;
        distributor.distributeBatch(1, 1, remaining, remainingAmount);
        distributor.finishEpoch(1);
        require(token.balanceOf(address(0xA1)) == 50, "multi-NFT weight");
        require(token.balanceOf(address(0xB2)) == 25 && token.balanceOf(address(0xC3)) == 25, "equal weight");
        require(distributor.epochFinished(1), "not finished");

        escrow.depositFor(address(adapter), address(token), 50);
        require(adapter.fundEpoch(1, address(distributor), 10_000, 0) == 100, "retry");
        require(escrow.balanceOfToken(address(adapter), address(token)) == 50, "duplicate claim");
    }

    function testDistributionShareAndCapSendRemainderToTreasury() public {
        token.mint(address(this), 100);
        token.approve(address(escrow), 100);
        escrow.depositFor(address(adapter), address(token), 100);
        uint256 funded = adapter.fundEpoch(2, address(distributor), 8_000, 70);
        require(funded == 70, "cap");
        require(token.balanceOf(address(distributor)) == 70, "distributor share");
        require(token.balanceOf(treasury) == 30, "treasury remainder");
    }
}
