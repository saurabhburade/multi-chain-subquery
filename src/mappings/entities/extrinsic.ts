import { SubstrateExtrinsic } from "@subql/types";
import {
  CollectiveData,
  DataSubmission,
  Extrinsic,
  PriceFeedMinute,
  TransferEntity,
} from "../../types";
import { CorrectSubstrateBlock } from "../mappingHandlers";
import { formatInspect } from "../../utils/inspect";
import {
  getFeesFromEvent,
  handleDaSubmissionData,
  handleVectorExecuteMessage,
  handleVectorSendMessage,
} from "../../utils/extrinsic";
import { handleDayData } from "../intervals/day/handleDayData";

export async function handleExtrinsics(
  block: CorrectSubstrateBlock,
  priceFeed: PriceFeedMinute
) {
  const blockNumber = block.block.header.number.toNumber();
  const blockNumberString = blockNumber.toString();
  const blockHash = block.block.header.hash.toString();

  const events: Event[] = [];
  const calls: Extrinsic[] = [];
  const daSubmissions: DataSubmission[] = [];
  const extIdToDetails: {
    [key: number]: {
      nbEvents: number;
      success?: boolean;
      fee?: string;
      feeRounded?: number;
    };
  } = {};
  let collectiveData = await CollectiveData.get("1");
  if (collectiveData === undefined || collectiveData === null) {
    collectiveData = CollectiveData.create({
      id: "1",
      timestampLast: block.timestamp,
      totalByteSize: 0,
      avgAvailPrice: priceFeed.availPrice,
      avgEthPrice: priceFeed.ethPrice,
      lastPriceFeedId: priceFeed.id,
      totalBlocksCount: 0,
      totalDataAccountsCount: 0,
      totalDataSubmissionCount: 0,
      totalDataBlocksCount: 0,
      totalExtrinsicCount: 0,
      totalFees: 0,
      totalFeesAvail: 0,
      totalFeesUSD: 0,
      totalTransferCount: 0,
      totalDAFees: 0,
      totalDAFeesUSD: 0,
    });
  }
  collectiveData.timestampLast = block.timestamp;
  collectiveData.lastPriceFeedId = priceFeed.id;
  collectiveData.totalBlocksCount = collectiveData.totalBlocksCount! + 1;

  collectiveData.totalExtrinsicCount =
    collectiveData.totalExtrinsicCount! + block.block.extrinsics.length;
  collectiveData.avgAvailPrice =
    (collectiveData.avgAvailPrice! + priceFeed.availPrice) / 2;
  collectiveData.avgAvailPrice =
    (collectiveData.avgEthPrice! + priceFeed.ethPrice) / 2;

  block.events.map((evt, idx) => {
    const key = `${evt.event.section}.${evt.event.method}`;
    const relatedExtrinsicIndex = evt.phase.isApplyExtrinsic
      ? evt.phase.asApplyExtrinsic.toNumber()
      : -1;
    if (relatedExtrinsicIndex !== -1) {
      if (extIdToDetails[relatedExtrinsicIndex] === undefined) {
        extIdToDetails[relatedExtrinsicIndex] = {
          nbEvents: 0,
        };
      }
      extIdToDetails[relatedExtrinsicIndex].nbEvents += 1;
      if (key === "transactionPayment.TransactionFeePaid") {
        let fees = getFeesFromEvent(evt.event.data.toJSON() as any[]);
        extIdToDetails[relatedExtrinsicIndex].fee = fees.fee;
        extIdToDetails[relatedExtrinsicIndex].feeRounded = fees.feeRounded;
      }
      if (key === "system.ExtrinsicSuccess")
        extIdToDetails[relatedExtrinsicIndex].success = true;
    }
  });
  // FEES calc
  let totalFee = 0; // Initialize totalFee as a BigInt to handle large numbers

  // Iterate through each extrinsic ID and add the fee to totalFee
  for (const id in extIdToDetails) {
    const details = extIdToDetails[id];

    // Only add the fee if it exists and is a valid number
    if (details.fee) {
      // Convert fee to BigInt (or Number if fee is smaller)
      totalFee += Number(details.fee); // Or use parseFloat(details.fee) for decimals
    }
  }
  const totalFeeUSD = totalFee * priceFeed.availPrice;
  collectiveData.totalFees = collectiveData.totalFees! + totalFee;
  collectiveData.totalFeesAvail = collectiveData.totalFeesAvail! + totalFee;
  collectiveData.totalFeesUSD = collectiveData.totalFeesUSD! + totalFeeUSD;
  // Extrinsics

  logger.info(`Block Extrinsics - ${block.block.extrinsics.length}`);
  if (totalFee > 0) {
    logger.info(`Block Extrinsics FEES - ${JSON.stringify(extIdToDetails)}`);
  }
  block.block.extrinsics.map((extrinsic, idx) => {
    const methodData = extrinsic.method;
    const extrinsicType = `${methodData.section}_${methodData.method}`;
    const isDataSubmission = extrinsicType === "dataAvailability_submitData";
    // We use this instead of "wrapExtrinsic" to avoid looping on events
    const substrateExtrinsic: Omit<SubstrateExtrinsic, "events" | "success"> = {
      idx,
      extrinsic,
      block,
    };
    const extraData = extIdToDetails[idx];

    calls.push(
      handleCall(
        `${blockNumberString}-${idx}`,
        substrateExtrinsic,
        extraData,
        priceFeed
      )
    );

    if (isDataSubmission) {
      daSubmissions.push(
        handleDataSubmission(
          `${blockNumberString}-${idx}`,
          substrateExtrinsic,
          extraData,
          priceFeed
        )
      );
    }
  });

  if (daSubmissions.length > 0) {
    const daFees = daSubmissions.reduce((sum, das) => {
      if (das.fees) {
        sum = sum + das.fees || 0;
      }
      return sum;
    }, 0);
    const daSize = daSubmissions.reduce((sum, das) => {
      if (das.byteSize) {
        sum = sum + das.byteSize || 0;
      }
      return sum;
    }, 0);
    const daFeesUSD = daFees * priceFeed.availPrice;
    collectiveData.totalDataBlocksCount =
      collectiveData.totalDataBlocksCount! + 1;
    collectiveData.totalDAFees = collectiveData.totalDAFees! + daFees;
    collectiveData.totalDAFeesUSD = collectiveData.totalDAFeesUSD! + daFeesUSD;
    collectiveData.totalDataSubmissionCount =
      collectiveData.totalDataSubmissionCount! + daSubmissions.length;
    collectiveData.totalByteSize = collectiveData.totalByteSize! + daSize || 0;
  }
  await handleDayData(block, priceFeed, calls, daSubmissions);
  await Promise.all([
    await collectiveData.save(),
    store.bulkCreate("Extrinsic", calls),
    store.bulkCreate("DataSubmission", daSubmissions),
  ]);
}

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
    | undefined,
  priceFeed: PriceFeedMinute
): Extrinsic {
  try {
    const block = extrinsic.block as CorrectSubstrateBlock;
    const ext = extrinsic.extrinsic;
    const methodData = ext.method;
    const key = `${methodData.section}_${methodData.method}`;
    // const argsValue =
    //   key === "dataAvailability_submitData"
    //     ? // We handle the block differently
    //       methodData.args.map((a, i) =>
    //         i === 0 ? handleDaSubmissionData(a) : a.toString()
    //       )
    //     : key === "vector_execute"
    //     ? // We handle the parameter of index 1 of vector execute differently
    //       methodData.args.map((a, i) =>
    //         i === 1 ? handleVectorExecuteMessage(a) : a.toString()
    //       )
    //     : key === "vector_sendMessage"
    //     ? // We handle the parameter of index 0 of vector send message differently
    //       methodData.args.map((a, i) =>
    //         i === 0 ? handleVectorSendMessage(a) : a.toString()
    //       )
    //     : methodData.args.map((a) => a.toString());

    const extrinsicRecord = Extrinsic.create({
      id: ext.hash.toString(), // txHash - Transaction hash
      blockId: block.block.header.number.toString(), // blockId - Block height/number
      txHash: ext.hash.toString(), // txHash - Transaction hash
      module: methodData.section, // module - The module the extrinsic belongs to
      call: methodData.method, // call - The method of the extrinsic
      blockHeight: block.block.header.number.toString(), // blockHeight - The block's height as a BigInt
      success: extraDetails?.success || false, // success - Whether the extrinsic was successful
      isSigned: ext.isSigned, // isSigned - Whether the extrinsic is signed
      extrinsicIndex: extrinsic.idx, // extrinsicIndex - Index of the extrinsic in the block
      hash: ext.hash.toString(), // hash - The hash of the extrinsic
      timestamp: block.timestamp, // timestamp - The timestamp when the block was produced
      signer: ext.signer.toString(), // signer - The account that signed the extrinsic
      signature: ext.signature.toString(), // signature - The signature of the extrinsic
      nonce: ext.nonce.toNumber(), // nonce - The nonce of the extrinsic
      argsName: methodData.meta.args.map((a) => a.name.toString()), // argsName - List of argument names in the extrinsic method
      argsValue: [], // argsValue - List of argument values passed to the extrinsic
      nbEvents: extraDetails?.nbEvents || 0, // nbEvents - The number of events related to the extrinsic
      ethPrice: priceFeed.ethPrice, // ethPrice - Current Ethereum price (or some other token's price)
      availPrice: priceFeed.availPrice, // availPrice - Availability price (if applicable)
      ethBlock: priceFeed.ethBlock, // ethBlock - The block number from Ethereum (or relevant chain)
    });

    extrinsicRecord.fees = extraDetails?.fee ? extraDetails?.fee : "0";
    extrinsicRecord.feesRounded = extraDetails?.feeRounded
      ? extraDetails?.feeRounded
      : 0;
    logger.info(`Saved Extrinsic - ${JSON.stringify(extrinsicRecord)}`);
    // extrinsicRecord.save();
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
    | undefined,
  priceFeed: PriceFeedMinute
): DataSubmission {
  try {
    const block = extrinsic.block as CorrectSubstrateBlock;
    const ext = extrinsic.extrinsic;
    const methodData = ext.method;

    let dataSubmissionSize =
      methodData.args.length > 0 ? methodData.args[0].toString().length / 2 : 0;
    const formattedInspect = formatInspect(ext.inspect());
    const appIdInspect = formattedInspect.find((x) => x.name === "appId");
    // const appName = formattedInspect.find((x) => x.name === "name");
    logger.info(`formattedInspect - ${JSON.stringify(formattedInspect)}`);
    const appId = appIdInspect ? Number(appIdInspect.value) : 0;
    const dataSubmissionRecord = DataSubmission.create({
      id: idx,
      appId,
      byteSize: dataSubmissionSize,
      extrinsicId: idx,
      signer: ext.signer.toString(),
      timestamp: block.timestamp,
      priceFeedId: priceFeed.id,
    });

    if (extraDetails?.feeRounded) {
      dataSubmissionRecord.fees = extraDetails.feeRounded;
      const oneMbInBytes = 1_048_576;
      const feesPerMb =
        (extraDetails.feeRounded / dataSubmissionSize) * oneMbInBytes;
      dataSubmissionRecord.feesPerMb = feesPerMb;
    }

    // dataSubmissionRecord.save();
    return dataSubmissionRecord;
  } catch (error) {
    logger.error("handleDataSubmission error detail:" + error);

    throw error;
  }
}
