import { EthereumBlock } from "@subql/types-ethereum";
import { OneinchABIAbi__factory } from "../types/contracts";
import { ethers } from "ethers";
import { PriceFeed } from "../types";

const ORACLE_ADDRESS = "0x0AdDd25a91563696D8567Df78D5A01C9a991F9B8";

export async function handleEthBlock(block: EthereumBlock): Promise<void> {
  logger.info(`New BLOCK ETHEREUM ::::::  ${block.number.toString()}`);
  // logger.info(`New BLOCK ETHEREUM time::::::  ${block.timestamp.toString()}`);
  // Do something with each block handler here
  //   const provider = new ethers.providers.JsonRpcProvider(
  //     "https://eth.llamarpc.com"
  //   );

  const oracleContract = OneinchABIAbi__factory.connect(
    ORACLE_ADDRESS,
    api as any
  );
  const eth = await oracleContract.getRate(
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
    "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
    false
  );
  const avail = await oracleContract.getRate(
    "0xEeB4d8400AEefafC1B2953e0094134A887C76Bd8", // WETH
    "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
    false
  );
  let priceFeed = await PriceFeed.get("1");
  if (priceFeed === undefined || priceFeed === null) {
    priceFeed = PriceFeed.create({
      id: "1",
      availPrice: avail.toNumber(),
      ethPrice: eth.toNumber(),
      blockNumber: block.number,
      date: new Date(block.timestamp.toString()),
    });
  }
  await priceFeed.save();
  logger.info(`New ETHEREUM Price::::::  ${eth.toString()}`);
}
