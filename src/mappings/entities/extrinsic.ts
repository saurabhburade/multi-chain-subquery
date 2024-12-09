import { SubstrateExtrinsic } from "@subql/types";
import {
  DataSubmission,
  Extrinsic,
  PriceFeedMinute,
  TransferEntity,
} from "../../types";
import { CorrectSubstrateBlock } from "../mappingHandlers";
import { formatInspect } from "../../utils/inspect";
import {
  handleDaSubmissionData,
  handleVectorExecuteMessage,
  handleVectorSendMessage,
} from "../../utils/extrinsic";

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

  // Extrinsics

  logger.info(`Block Extrinsics - ${block.block.extrinsics.length}`);
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

    handleCall(
      `${blockNumberString}-${idx}`,
      substrateExtrinsic,
      extraData,
      priceFeed
    );

    // if (isDataSubmission)
    //   daSubmissions.push(
    //     handleDataSubmission(
    //       `${blockNumberString}-${idx}`,
    //       substrateExtrinsic,
    //       extraData
    //     )
    //   );
  });
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
    extrinsicRecord.save();
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
    | undefined
): DataSubmission {
  try {
    const block = extrinsic.block as CorrectSubstrateBlock;
    const ext = extrinsic.extrinsic;
    const methodData = ext.method;

    let dataSubmissionSize =
      methodData.args.length > 0 ? methodData.args[0].toString().length / 2 : 0;
    const formattedInspect = formatInspect(ext.inspect());
    const appIdInspect = formattedInspect.find((x) => x.name === "appId");
    const appId = appIdInspect ? Number(appIdInspect.value) : 0;
    const dataSubmissionRecord = DataSubmission.create({
      id: idx,
      appId,
      byteSize: dataSubmissionSize,
      extrinsicId: idx,
      signer: ext.signer.toString(),
      timestamp: block.timestamp,
    });

    if (extraDetails?.feeRounded) {
      dataSubmissionRecord.fees = extraDetails.feeRounded;
      const oneMbInBytes = 1_048_576;
      const feesPerMb =
        (extraDetails.feeRounded / dataSubmissionSize) * oneMbInBytes;
      dataSubmissionRecord.feesPerMb = feesPerMb;
    }
    logger.info(
      `Saved DataSubmission - ${JSON.stringify(dataSubmissionRecord)}`
    );

    return dataSubmissionRecord;
  } catch (error) {
    logger.error("handleDataSubmission error detail:" + error);

    throw error;
  }
}
