import { PriceFeedMinute } from "../../types";
import { OneinchABIAbi__factory } from "../../types/contracts";
import { ORACLE_ADDRESS } from "../helper";
import { CorrectSubstrateBlock } from "../mappingHandlers";
import fetch from "node-fetch";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function handleNewPriceMinute({
  //   availPrice,
  //   ethPrice,
  //   ethBlock,
  //   availBlock,
  //   ethDate,
  //   availDate,
  block,
}: {
  //   availPrice: number;
  //   ethPrice: number;
  //   ethBlock: number;
  //   availBlock: number;
  //   ethDate: Date;
  //   availDate: Date;
  block: CorrectSubstrateBlock;
}): Promise<PriceFeedMinute> {
  const blockDate = new Date(Number(block.timestamp.getTime()));
  const minuteId = Math.floor(blockDate.getTime() / 60000);
  try {
    let priceFeedMinute = await PriceFeedMinute.get(minuteId.toString());

    if (priceFeedMinute === undefined || priceFeedMinute === null) {
      await delay(500);
      const ife = OneinchABIAbi__factory.createInterface();
      const encodedEth = ife.encodeFunctionData("getRate", [
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
        "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
        false,
      ]);
      const encodedAvail = ife.encodeFunctionData("getRate", [
        "0xEeB4d8400AEefafC1B2953e0094134A887C76Bd8", // WETH
        "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
        false,
      ]);

      const blockNumberApi = await fetch(
        `https://coins.llama.fi/block/ethereum/${Number(
          block.timestamp.getTime() / 1000
        )}`,
        {
          method: "GET",
        }
      );
      let ethBlockContext = {};
      const ethBlockContextLlama = await blockNumberApi.json();

      if (ethBlockContextLlama.height) {
        ethBlockContext = {
          height: Number(ethBlockContextLlama.height),
          timestamp: Number(block.timestamp.getTime() / 1000),
        };
      } else {
        const blockNumberApiEtherscan = await fetch(
          `https://api.etherscan.io/api?module=block&action=getblocknobytime&timestamp=${Number(
            block.timestamp.getTime() / 1000
          )}&closest=before&apikey=QW2D5TW4VG4BYK8I5G6WMUCA9ENWGAHUYJ`,
          {
            method: "GET",
          }
        );
        const ethBlockContextEtherescan = await blockNumberApiEtherscan.json();
        if (ethBlockContextEtherescan.result) {
          ethBlockContext = {
            height: Number(ethBlockContextEtherescan.result),
            timestamp: Number(block.timestamp.getTime() / 1000),
          };
        }
        //
      }
      logger.info(
        `Expected ETH BLOCK::::::  ${JSON.stringify(
          ethBlockContext
        )} AT ${Number(
          block.timestamp.getTime() / 1000
        )} ::: Date :: ${blockDate}`
      );
      const rpcDataEth = await fetch(
        "https://lb.drpc.org/ogrpc?network=ethereum&dkey=ArT8p5S52UM0rgz3Qb99bmtcIwWxtHwR75vAuivZK8k9",
        {
          method: "POST",
          headers: {},
          body: JSON.stringify({
            id: 1,
            jsonrpc: "2.0",
            method: "eth_call",
            params: [
              {
                to: ORACLE_ADDRESS,
                data: encodedEth,
              },
              // @ts-ignore
              `0x${ethBlockContext.height.toString(16)}`,
            ],
          }),
        }
      );
      const rpcDataAvail = await fetch(
        "https://lb.drpc.org/ogrpc?network=ethereum&dkey=ArT8p5S52UM0rgz3Qb99bmtcIwWxtHwR75vAuivZK8k9",
        {
          method: "POST",
          headers: {},
          body: JSON.stringify({
            id: 1,
            jsonrpc: "2.0",
            method: "eth_call",
            params: [
              {
                to: ORACLE_ADDRESS,
                data: encodedAvail,
              },
              // @ts-ignore
              `0x${ethBlockContext.height.toString(16)}`,
            ],
          }),
        }
      );
      const ethResultRaw = await rpcDataEth.json();
      const availResultRaw = await rpcDataAvail.json();
      if (ethResultRaw) {
        logger.info(
          `RAW ETH Price Feed::::::  ${JSON.stringify(ethResultRaw)}`
        );
      }
      const decodedEth = ife.decodeFunctionResult(
        "getRate",
        ethResultRaw.result
      );
      const decodedAvail = ife.decodeFunctionResult(
        "getRate",
        availResultRaw.result
      );

      if (decodedEth) {
        logger.info(`New ETH Price Feed::::::  ${decodedEth.toString()}`);
      }
      if (decodedAvail) {
        logger.info(`New AVAIL Price Feed::::::  ${decodedAvail.toString()}`);
      }
      const availPrice = Number(decodedAvail.toString()) / 1e6;
      const ethPrice = Number(decodedEth.toString()) / 1e6;
      const availBlock = block.block.header.number.toNumber();
      const availDate = blockDate;
      // @ts-ignore
      const ethBlock = Number(ethBlockContext.height);
      // @ts-ignore
      const ethDate = new Date(Number(ethBlockContext.timestamp) * 1000);
      priceFeedMinute = PriceFeedMinute.create({
        id: minuteId.toString(),
        availPrice,
        ethPrice,
        availBlock,
        ethBlock,
        availDate,
        ethDate,
      });
      priceFeedMinute.availPrice = availPrice;
      priceFeedMinute.ethPrice = ethPrice;
      logger.info(
        `SAVING NEW PRICE MINUTE ::::  ${priceFeedMinute.ethPrice.toString()} :: ID:: ${minuteId} :: AT:: ${blockDate}`
      );
      await priceFeedMinute.save();
    } else {
      logger.info(
        `PRICE ALREADY EXIST ::::  ${priceFeedMinute.ethPrice.toString()} :: ID:: ${minuteId} :: AT:: ${blockDate}`
      );
    }

    // logger.info(
    //   `New AVAIL Price Feed Minute::::::  ${priceFeedMinute.availPrice.toString()} :: ID:: ${minuteId} :: AT:: ${blockDate}`
    // );
    return priceFeedMinute;
  } catch (error) {
    const priceFeedLastMinute = await PriceFeedMinute.get(
      (Number(minuteId) - 1).toString()
    );
    if (priceFeedLastMinute) {
      return priceFeedLastMinute!;
    } else {
      throw error;
    }
  }
}
