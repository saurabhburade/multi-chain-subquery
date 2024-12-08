import {
  EventRecord,
  Digest,
  Header,
  AccountId,
} from "@polkadot/types/interfaces";
import { SubstrateExtrinsic, SubstrateBlock } from "@subql/types";
import {
  Event,
  Extrinsic,
  SpecVersion,
  Block,
  Session,
  Log,
  HeaderExtension,
  Commitment,
  AppLookup,
  AccountEntity,
  DataSubmission,
  TransferEntity,
  PriceFeed,
  PriceFeedMinute,
} from "../types";
import { transferHandler, updateAccounts } from "../utils/balances";
import { extractAuthor } from "../utils/author";
import { formatInspect } from "../utils/inspect";
import {
  getFeesFromEvent,
  handleDaSubmission,
  handleVectorExecuteMessage,
  handleVectorSendMessage,
} from "../utils/extrinsic";
import { AccounToUpdateValue } from "../types/models/AccounToUpdateValue";
import { ethers } from "ethers";
import { OneinchABIAbi__factory } from "../types/contracts";

import fetch from "node-fetch";

let specVersion: SpecVersion;
const ENABLE_LOG = true;
const ORACLE_ADDRESS = "0x0AdDd25a91563696D8567Df78D5A01C9a991F9B8";

export const balanceEvents = [
  "balances.BalanceSet",
  "balances.Deposit",
  "balances.DustLost",
  "balances.Endowed",
  "balances.Reserved",
  "balances.Unreserved",
  "balances.Withdraw",
  "balances.Upgraded",
];
export const allBalanceEvents = [...balanceEvents, "balances.Slashed"];
export const feeEvents = ["transactionPayment.TransactionFeePaid"];
export const transferEvents = ["balances.Transfer"];
export const filteredOutEvents = [
  ...balanceEvents,
  ...feeEvents,
  "treasury.Deposit",
  "system.Remarked",
  "system.ExtrinsicSuccess",
  "system.ExtrinsicFailed",
];

// Set timestamp as mandatory, since in `SubstrateBlock` timestamp is now an optional field.
// For us, it will never be empty and this is only to satisfy the compiler.
export interface CorrectSubstrateBlock extends SubstrateBlock {
  timestamp: Date;
}
const REFERENCE_BLOCK_TIMESTAMP = 1720082315000;
const BLOCK_TIME = 12;
const REFERENCE_BLOCK = 20232007;
const getBlockForTimestamp = (stamp: number) => {
  const referenceTime = REFERENCE_BLOCK_TIMESTAMP;
  const targetTime = stamp;
  // Calculate the time difference in seconds
  const timeDifferenceInSeconds = (targetTime - referenceTime) / 1000;
  // Calculate how many blocks have passed since the reference block
  const blocksPassed = timeDifferenceInSeconds / BLOCK_TIME;

  // Estimate the block number for the given target date
  const estimatedBlockNumber = REFERENCE_BLOCK + Math.floor(blocksPassed);

  return estimatedBlockNumber;
};
export async function handleBlock(block: CorrectSubstrateBlock): Promise<void> {
  const blockHeader = block.block.header;
  let blockRecord = await Block.get(blockHeader.number.toString());
  const blockDate = new Date(Number(block.timestamp.getTime()));
  const minuteId = Math.floor(blockDate.getTime() / 60000);
  if (blockRecord === undefined || blockRecord === null) {
    try {
      // const httpData = await fetch("https://api.github.com/users/github", {
      //   method: "GET",
      //   headers: {},
      // });
      // const httpData = await fetch("https://api.github.com/users/github", {
      //   method: "POST",
      //   headers: {},
      //   body: "0x802431fb000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec70000000000000000000000000000000000000000000000000000000000000000",
      // });
      // const jsonData = await httpData.json();
      // logger.info(`httpData: ${JSON.stringify(jsonData)}`);
      // const provider = new ethers.providers.JsonRpcProvider(
      //   "https://lb.drpc.org/ogrpc?network=ethereum&dkey=ArT8p5S52UM0rgz3Qb99bmtcIwWxtHwR75vAuivZK8k9"
      // );
      // const oracleContract = OneinchABIAbi__factory.connect(
      //   ORACLE_ADDRESS,
      //   // @ts-ignore
      //   provider
      // );
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
      // @ts-ignore
      const blockNumber = await (api as any).rpc.eth.blockNumber();
      logger.info(` Expected ETH BLOCK::::::  ${blockNumber}`);
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
            ],
          }),
          //     {
          //     method: 'eth_call',
          //     data: '0x802431fb000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec70000000000000000000000000000000000000000000000000000000000000000',
          //   },
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
            ],
          }),
          //     {
          //     method: 'eth_call',
          //     data: '0x802431fb000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec70000000000000000000000000000000000000000000000000000000000000000',
          //   },
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
      // ife.decodeFunctionData();
      // const eth = await oracleContract.populateTransaction.getRate(
      //   "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
      //   "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
      //   false
      // );
      // const avail = await oracleContract.populateTransaction.getRate(
      //   "0xEeB4d8400AEefafC1B2953e0094134A887C76Bd8", // WETH
      //   "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
      //   false
      // );
      if (decodedEth) {
        logger.info(`New ETH Price Feed::::::  ${decodedEth.toString()}`);
      }
      if (decodedAvail) {
        logger.info(`New AVAIL Price Feed::::::  ${decodedAvail.toString()}`);
      }

      // logger.info(`New ETHEREUM Price::::::  ${eth.toString()}`);
      // blockRecord = new Block(
      //   blockHeader.number.toString(),
      //   blockHeader.number.toNumber(),
      //   blockHeader.hash.toString(),
      //   block.timestamp,
      //   blockHeader.parentHash.toString(),
      //   blockHeader.stateRoot.toString(),
      //   blockHeader.extrinsicsRoot.toString(),
      //   block.specVersion,
      //   block.block.extrinsics.length,
      //   block.events.length
      // );

      // const ethBlock = getBlockForTimestamp(Number(block.timestamp.getTime()));
      // // const provider = new ethers.providers.JsonRpcProvider(
      // //   "https://lb.drpc.org/ogrpc?network=ethereum&dkey=ArT8p5S52UM0rgz3Qb99bmtcIwWxtHwR75vAuivZK8k9"
      // // );
      // // const oracleContract = OneinchABIAbi__factory.connect(
      // //   ORACLE_ADDRESS,
      // //   provider
      // // );
      // // const eth = await oracleContract.getRate(
      // //   "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
      // //   "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
      // //   false
      // // );
      // // const avail = await oracleContract.getRate(
      // //   "0xEeB4d8400AEefafC1B2953e0094134A887C76Bd8", // WETH
      // //   "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
      // //   false
      // // );
      // // logger.info(
      // //   "PRICE FEED FOUND :::: ",
      // //   eth.toString(),
      // //   avail.toString(),
      // //   ethBlock
      // // );
      // logger.info(
      //   "Expected ETHBLOCK :::: " + ethBlock + "::::::" + blockDate.toString()
      // );
      // blockRecord.author = "";
      // blockRecord.sessionId = 1;
      // // @ts-ignore
      // // const priceFeed = await PriceFeedMinute.get(minuteId.toString());
      // // const priceFeedBundle = await PriceFeed.get("1");
      // // logger.info(
      // //   "PRICE FEED FOUND::::",
      // //   priceFeed!.ethPrice.toString(),
      // //   priceFeedBundle!.ethPrice.toString()
      // // );
      // logger.info(
      //   "BLOCK SAVED ::::::::::::::::::" +
      //     block.block.header.number.toNumber() +
      //     "::::::::::::::::::" +
      //     blockHeader.hash.toString() +
      //     ":::::MINUTE ::: " +
      //     minuteId.toString()
      // );

      // return await blockRecord.save();
    } catch (error) {
      logger.error(
        "BLOCK SAVE ERRORRRRRR ::::::::::::::::::" +
          block.block.header.number.toNumber() +
          "::::::::::::::::::" +
          blockHeader.hash.toString()
      );
      logger.error("BLOCK SAVE ERRORRRRRR ::::::::::::::::::" + error);
    }
  }
}

export const blockHandler = async (
  block: CorrectSubstrateBlock,
  specVersion: SpecVersion
): Promise<void> => {
  try {
    const blockHeader = block.block.header;
    let blockRecord = await Block.get(blockHeader.number.toString());
    if (!blockRecord) {
      blockRecord = Block.create({
        id: blockHeader.number.toString(),
        number: blockHeader.number.toNumber(),
        hash: blockHeader.hash.toString(),
        timestamp: block.timestamp,
        parentHash: blockHeader.parentHash.toString(),
        stateRoot: blockHeader.stateRoot.toString(),
        extrinsicsRoot: blockHeader.extrinsicsRoot.toString(),
        runtimeVersion: block.specVersion,
        nbExtrinsics: block.block.extrinsics.length,
        nbEvents: block.events.length,
      });
      logger.info(
        "BLOCK SAVED ::::::::::::::::::" + block.block.header.number.toNumber()
      );

      return await blockRecord.save();
    }

    // await Promise.all([
    //   handleLogs(blockHeader.number.toString(), blockHeader.digest),
    //   updateSession(blockRecord, blockHeader.digest),
    //   updateSpecversion(
    //     specVersion,
    //     block.specVersion,
    //     blockHeader.number.toBigInt()
    //   ),
    //   handleExtension(blockHeader),
    // ]);
  } catch (err) {
    logger.error("record block error:" + block.block.header.number.toNumber());
    logger.error("record block error detail:" + err);
  }
};

export function handleCall(
  idx: string,
  extrinsic: Omit<SubstrateExtrinsic, "events" | "success">,
  extraDetails:
    | {
        nbEvents: number;
        success?: boolean | undefined;
        fee?: string | undefined;
        feeRounded?: number | undefined;
      }
    | undefined
): Extrinsic {
  try {
    const block = extrinsic.block as CorrectSubstrateBlock;
    const ext = extrinsic.extrinsic;
    const methodData = ext.method;
    const key = `${methodData.section}_${methodData.method}`;
    const argsValue =
      key === "dataAvailability_submitData"
        ? // We handle the block differently
          methodData.args.map((a, i) =>
            i === 0 ? handleDaSubmission(a) : a.toString()
          )
        : key === "vector_execute"
        ? // We handle the parameter of index 1 of vector execute differently
          methodData.args.map((a, i) =>
            i === 1 ? handleVectorExecuteMessage(a) : a.toString()
          )
        : key === "vector_sendMessage"
        ? // We handle the parameter of index 0 of vector send message differently
          methodData.args.map((a, i) =>
            i === 0 ? handleVectorSendMessage(a) : a.toString()
          )
        : methodData.args.map((a) => a.toString());

    const extrinsicRecord = new Extrinsic(
      idx,
      block.block.header.number.toString(),
      ext.hash.toString(),
      methodData.section,
      methodData.method,
      block.block.header.number.toBigInt(),
      extraDetails?.success || false,
      ext.isSigned,
      extrinsic.idx,
      ext.hash.toString(),
      block.timestamp,
      // descriptionRecord.id,
      ext.signer.toString(),
      ext.signature.toString(),
      ext.nonce.toNumber(),
      methodData.meta.args.map((a) => a.name.toString()),
      argsValue,
      extraDetails?.nbEvents || 0
    );
    extrinsicRecord.fees = extraDetails?.fee ? extraDetails?.fee : "0";
    extrinsicRecord.feesRounded = extraDetails?.feeRounded
      ? extraDetails?.feeRounded
      : 0;
    return extrinsicRecord;
  } catch (err: any) {
    logger.error(
      `record extrinsic error at : hash(${
        extrinsic.extrinsic.hash
      }) and block nb ${extrinsic.block.block.header.number.toNumber()}`
    );
    logger.error("record extrinsic error detail:" + err);
    if (err.sql) logger.error("record extrinsic error sql detail:" + err.sql);
    throw err;
  }
}

export function handleEvent(
  blockNumber: string,
  eventIdx: number,
  event: EventRecord,
  extrinsicId: number,
  timestamp: Date
): Event {
  try {
    const eventData = event.event;
    const argsValue =
      `${eventData.section}_${eventData.method}` ===
      "dataAvailability_DataSubmitted"
        ? eventData.data.map((a, i) =>
            i === 1 ? a.toString().slice(0, 64) : a.toString()
          )
        : eventData.data.map((a) => a.toString());

    const newEvent = new Event(
      `${blockNumber}-${eventIdx}`,
      blockNumber,
      eventData.section,
      eventData.method,
      BigInt(blockNumber),
      eventIdx,
      eventData.method,
      // descriptionRecord.id,
      eventData.meta.args.map((a) => a.toString()),
      argsValue,
      timestamp
    );
    if (extrinsicId !== -1)
      newEvent.extrinsicId = `${blockNumber}-${extrinsicId}`;
    return newEvent;
  } catch (err) {
    logger.error(
      "record event error at block number:" + blockNumber.toString()
    );
    logger.error("record event error detail:" + err);
    throw err;
  }
}

export function handleDataSubmission(
  idx: string,
  extrinsic: Omit<SubstrateExtrinsic, "events" | "success">,
  extraDetails:
    | {
        nbEvents: number;
        success?: boolean | undefined;
        fee?: string | undefined;
        feeRounded?: number | undefined;
      }
    | undefined
): DataSubmission {
  const block = extrinsic.block as CorrectSubstrateBlock;
  const ext = extrinsic.extrinsic;
  const methodData = ext.method;

  let dataSubmissionSize =
    methodData.args.length > 0 ? methodData.args[0].toString().length / 2 : 0;
  const formattedInspect = formatInspect(ext.inspect());
  const appIdInspect = formattedInspect.find((x) => x.name === "appId");
  const appId = appIdInspect ? Number(appIdInspect.value) : 0;
  const dataSubmissionRecord = new DataSubmission(
    idx,
    idx,
    block.timestamp,
    dataSubmissionSize,
    appId,
    ext.signer.toString()
  );
  if (extraDetails?.feeRounded) {
    dataSubmissionRecord.fees = extraDetails.feeRounded;
    const oneMbInBytes = 1_048_576;
    const feesPerMb =
      (extraDetails.feeRounded / dataSubmissionSize) * oneMbInBytes;
    dataSubmissionRecord.feesPerMb = feesPerMb;
  }
  return dataSubmissionRecord;
}

export const handleLogs = async (blockNumber: string, digest: Digest) => {
  for (const [i, log] of digest.logs.entries()) {
    let engine: string | undefined = undefined;
    let data = "";

    if (log.isConsensus) {
      engine = log.asConsensus[0].toString();
      data = log.asConsensus[1].toString();
    } else if (log.isSeal) {
      engine = log.asSeal[0].toString();
      data = log.asSeal[1].toString();
    } else if (log.isPreRuntime) {
      engine = log.asPreRuntime[0].toString();
      data = log.asPreRuntime[1].toString();
    } else if (log.isOther) data = log.asOther.toString();
    else if (log.isAuthoritiesChange) data = log.asAuthoritiesChange.toString();
    else if (log.isChangesTrieRoot) data = log.asAuthoritiesChange.toString();

    await handleLog(blockNumber, i, log.type, engine, data);
  }
};

export const handleLog = async (
  blockNumber: string,
  index: number,
  type: string,
  engine: string | undefined,
  data: string
) => {
  const logRecord = new Log(`${blockNumber}-${index}`, blockNumber, type, data);
  if (engine) logRecord.engine = engine;
  await logRecord.save();
};

export const updateSession = async (blockRecord: Block, digest: Digest) => {
  try {
    // @ts-ignore
    const sessionId = await (api as any).query.session.currentIndex();
    let sessionRecord = await Session.get(sessionId.toString());
    if (!sessionRecord) {
      const validators = (await // @ts-ignore
      (api as any).query.session.validators()) as unknown as string[];
      sessionRecord = new Session(
        sessionId.toString(),
        validators.map((x) => x.toString())
      );
      logger.info("FOUND VALIDATORS ::: ", validators.length);
      if (Number(validators.length) > 0) {
        await sessionRecord.save();
        await setAccountsAsValidators(validators.map((x) => x.toString()));
      }
    }
    blockRecord.sessionId = Number(sessionRecord.id);
    const author = extractAuthor(
      digest,
      sessionRecord.validators as unknown as AccountId[]
    );
    blockRecord.author = author ? author.toString() : undefined;
  } catch (err) {
    logger.error("update session error");
    logger.error("update session error detail:" + err);
  }
};

export const updateSpecversion = async (
  specVersion: SpecVersion,
  blockSpecVersion: number,
  blockNumber: bigint
) => {
  if (!specVersion) {
    let dbSpec = await SpecVersion.get(blockSpecVersion.toString());
    if (dbSpec) specVersion = dbSpec;
  }
  if (!specVersion || specVersion.id !== blockSpecVersion.toString()) {
    specVersion = new SpecVersion(blockSpecVersion.toString(), blockNumber);
    await specVersion.save();
  }
};

export const handleExtension = async (blockHeader: Header) => {
  const blockNumber = blockHeader.number.toString();
  const blockHeaderUnsafe = blockHeader as any;
  if (blockHeaderUnsafe.extension) {
    const extension = JSON.parse(blockHeaderUnsafe.extension);

    // Create extension
    const headerExtensionRecord = new HeaderExtension(blockNumber, blockNumber);
    let data: any = undefined;
    if (extension.v1 !== undefined) {
      headerExtensionRecord.version = "v1";
      data = extension.v1;
    }
    if (extension.v2 !== undefined) {
      headerExtensionRecord.version = "v2";
      data = extension.v2;
    }
    if (extension.v3 !== undefined) {
      headerExtensionRecord.version = "v3";
      data = extension.v3;
    }
    await headerExtensionRecord.save();

    // Create commitment
    const commitmentRecord = new Commitment(
      blockNumber,
      blockNumber,
      headerExtensionRecord.id
    );
    commitmentRecord.rows = data.commitment.rows;
    commitmentRecord.cols = data.commitment.cols;
    commitmentRecord.dataRoot = data.commitment.dataRoot;
    commitmentRecord.commitment = data.commitment.commitment;
    await commitmentRecord.save();

    // Create app lookup
    const appLookupRecord = new AppLookup(
      blockNumber,
      blockNumber,
      headerExtensionRecord.id
    );
    appLookupRecord.size = data.appLookup.size;
    appLookupRecord.index = JSON.stringify(data.appLookup.index);
    await appLookupRecord.save();
  }
};

export const setAccountsAsValidators = async (accounts: string[]) => {
  // const accountsInDb: AccountEntity[] = await Promise.all(
  //   accounts.map((accountId) => store.get("AccountEntity", accountId))
  // );
  accounts.forEach((acc) => {
    logger.info("547 account :: ", [acc]);
  });
  const accountsInDb: AccountEntity[] = await store.getByFields(
    "AccountEntity",
    [["address", "in", accounts]],
    {
      limit: accounts.length,
    }
  );
  const accountsToSave = accountsInDb.map((x) => {
    x.validator = true;
    x.validatorSessionParticipated = (x.validatorSessionParticipated || 0) + 1;
    return x;
  });
  await store.bulkUpdate("AccountEntity", accountsToSave);
};
