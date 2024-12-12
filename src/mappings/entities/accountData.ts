import { SubstrateExtrinsic } from "@subql/types";
import { AccountEntity, Extrinsic, PriceFeedMinute } from "../../types";
import { CorrectSubstrateBlock } from "../mappingHandlers";
import { handleAccountDayData } from "../intervals/day/handleDayData";
import { handleAccountHourData } from "../intervals/hour/handleHourData";

export async function handleAccount(
  extrinsicRecord: Extrinsic,
  extrinsic: Omit<SubstrateExtrinsic, "events" | "success">,
  priceFeed: PriceFeedMinute
) {
  const block = extrinsic.block as CorrectSubstrateBlock;
  const ext = extrinsic.extrinsic;
  const methodData = ext.method;
  let dataSubmissionSize =
    methodData.args.length > 0 ? methodData.args[0].toString().length / 2 : 0;
  let accountEntity = await AccountEntity.get(
    extrinsicRecord.signer.toString()
  );

  const oneMbInBytes = 1_048_576;
  const feesPerMb =
    (extrinsicRecord.feesRounded! / dataSubmissionSize) * oneMbInBytes;
  if (accountEntity === undefined || accountEntity === null) {
    accountEntity = AccountEntity.create({
      id: extrinsicRecord.signer.toString(),
      address: extrinsicRecord.signer.toString(),
      createdAt: extrinsicRecord.timestamp,
      timestampCreation: extrinsicRecord.timestamp,
      timestampLast: extrinsicRecord.timestamp,
      totalByteSize: 0,
      updatedAt: extrinsicRecord.timestamp,
      amount: "0",
      amountFrozen: "0",
      amountFrozenRounded: 0,
      amountRounded: 0,
      amountTotal: "0",
      amountTotalRounded: 0,
      avgAvailPrice: extrinsicRecord.availPrice,
      avgEthPrice: extrinsicRecord.ethPrice,
      totalDAFees: 0,
      totalDAFeesUSD: 0,
      totalDataSubmissionCount: 0,
      totalDataBlocksCount: 0,
      totalBlocksCount: 0,
      totalExtrinsicCount: 0,
      totalFees: 0,
      totalFeesAvail: 0,
      totalFeesUSD: 0,
      totalTransferCount: 0,
      lastPriceFeedId: priceFeed.id,
      endBlock: 0,
      startBlock: block.block.header.number.toNumber(),
    });
  }
  accountEntity.timestampLast = extrinsicRecord.timestamp;

  accountEntity.updatedAt = extrinsicRecord.timestamp;
  accountEntity.avgAvailPrice =
    (accountEntity.avgAvailPrice! + priceFeed.availPrice) / 2;
  accountEntity.avgEthPrice =
    (accountEntity.avgEthPrice! + priceFeed.ethPrice) / 2;
  const extrinsicType = `${methodData.section}_${methodData.method}`;
  const isDataSubmission = extrinsicType === "dataAvailability_submitData";
  const fees = Number(extrinsicRecord.fees);
  const feesUSD = fees * priceFeed.availPrice;
  if (isDataSubmission) {
    accountEntity.totalDAFees =
      accountEntity.totalDAFees! + Number(extrinsicRecord.fees)!;
    accountEntity.totalDAFeesUSD = accountEntity.totalDAFeesUSD! + feesUSD;
    accountEntity.totalDataSubmissionCount =
      accountEntity.totalDataSubmissionCount! + 1;

    accountEntity.totalByteSize =
      accountEntity.totalByteSize + Number(dataSubmissionSize);
    if (
      accountEntity.endBlock!.toString() !=
      block.block.header.number.toNumber().toString()
    ) {
      accountEntity.totalDataBlocksCount =
        accountEntity.totalDataBlocksCount! + 1;
    }
  }
  if (
    accountEntity.endBlock!.toString() !=
    block.block.header.number.toNumber().toString()
  ) {
    accountEntity.totalBlocksCount = accountEntity.totalBlocksCount! + 1;
  }
  accountEntity.totalExtrinsicCount = accountEntity.totalExtrinsicCount! + 1;
  accountEntity.totalFees =
    accountEntity.totalFees! + Number(extrinsicRecord.fees!);
  accountEntity.totalFeesAvail =
    accountEntity.totalFeesAvail! + Number(extrinsicRecord.fees!);
  accountEntity.totalFeesUSD = accountEntity.totalFeesUSD! + Number(feesUSD);
  accountEntity.lastPriceFeedId = priceFeed.id;
  accountEntity.endBlock = block.block.header.number.toNumber();
  await accountEntity.save();
}
