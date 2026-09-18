// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {TopblastDistributor,TopblastPonsV2FundingAdapter} from "../contracts/TopblastRewards.sol";

contract QqqMock is ERC20 {constructor() ERC20("QQQ","QQQ"){}function mint(address to,uint256 amount) external{_mint(to,amount);}}
contract V2EscrowMock {
    mapping(address=>mapping(address=>uint256)) public balanceOfToken;
    function deposit(address recipient,address token,uint256 amount) external{ERC20(token).transferFrom(msg.sender,address(this),amount);balanceOfToken[recipient][token]+=amount;}
    function claimToken(address token) external{uint256 amount=balanceOfToken[msg.sender][token];balanceOfToken[msg.sender][token]=0;ERC20(token).transfer(msg.sender,amount);}
}
contract V2CurveMock {
    QqqMock immutable token;V2EscrowMock immutable escrow;address public recipient;uint256 public fees;
    constructor(QqqMock token_,V2EscrowMock escrow_){token=token_;escrow=escrow_;}
    function setRecipient(address recipient_) external{require(recipient==address(0));recipient=recipient_;}
    function seed(uint256 amount) external{token.mint(address(this),amount);fees+=amount;}
    function sweepFees(uint256) external{require(msg.sender==recipient,"RECIPIENT");uint256 amount=fees;fees=0;token.approve(address(escrow),amount);escrow.deposit(msg.sender,address(token),amount);}
}

contract TopblastRewardsTest {
    QqqMock token;V2EscrowMock escrow;V2CurveMock curve;TopblastDistributor distributor;TopblastPonsV2FundingAdapter adapter;address treasury=address(0x777);
    function setUp() public{
        token=new QqqMock();escrow=new V2EscrowMock();distributor=new TopblastDistributor(address(token),address(this),address(this));
        adapter=new TopblastPonsV2FundingAdapter(address(token),address(distributor),address(this),address(this),treasury,address(escrow));curve=new V2CurveMock(token,escrow);curve.setRecipient(address(adapter));
    }
    function testOfficialV2ClaimSignatureFundsLossWeightedEpoch() public{
        curve.seed(100);require(adapter.sweepCreatorFees(1,address(curve))==100,"sweep");require(adapter.fundEpoch(1,address(distributor),8000,0)==80,"fund");require(adapter.latestFundedEpoch()==1,"latest funded");require(token.balanceOf(treasury)==20,"treasury");
        distributor.startEpoch(1,100,keccak256("snapshot"),80,2);address[] memory recipients=new address[](2);uint256[] memory amounts=new uint256[](2);recipients[0]=address(0xA1);recipients[1]=address(0xB2);amounts[0]=20;amounts[1]=60;
        distributor.distributeBatch(1,0,recipients,amounts);distributor.finishEpoch(1);require(token.balanceOf(address(0xA1))==20&&token.balanceOf(address(0xB2))==60,"payout");
        try distributor.distributeBatch(1,0,recipients,amounts){revert("duplicate accepted");}catch{}
        require(adapter.sweepCreatorFees(1,address(curve))==100,"sweep retry");require(adapter.fundEpoch(1,address(distributor),8000,0)==80,"fund retry");
    }
}
