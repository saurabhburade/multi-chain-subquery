import {
  CollectiveDayData,
  DataSubmission,
  Extrinsic,
  PriceFeedMinute,
} from "../../../types";
import { CorrectSubstrateBlock } from "../../mappingHandlers";

export async function handleDayData(
  block: CorrectSubstrateBlock,
  priceFeed: PriceFeedMinute,
  extrinsics: Extrinsic[],
  daSubmissions: DataSubmission[]
) {
  const blockDate = new Date(Number(block.timestamp.getTime()));
  const minuteId = Math.floor(blockDate.getTime() / 60000);
  const dayId = Math.floor(blockDate.getTime() / 86400000);
  const prevDayId = dayId - 1;

  let dayDataRecord = await CollectiveDayData.get(dayId.toString());
  if (dayDataRecord === undefined || dayDataRecord === null) {
    dayDataRecord = CollectiveDayData.create({
      id: dayId.toString(),
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
      timestampStart: block.timestamp,
      startBlock: block.block.header.number.toNumber(),
      endBlock: block.block.header.number.toNumber(),
      //   prevDayDataId: prevDayId.toString(),
    });
  }

  dayDataRecord.avgAvailPrice =
    (dayDataRecord.avgAvailPrice! + priceFeed.availPrice) / 2;
  dayDataRecord.avgEthPrice =
    (dayDataRecord.avgEthPrice! + priceFeed.ethPrice) / 2;
  dayDataRecord.endBlock = block.block.header.number.toNumber();
  dayDataRecord.timestampLast = block.timestamp;
  // FEES calc
  let totalFee = 0; // Initialize totalFee as a BigInt to handle large numbers

  // Iterate through each extrinsic ID and add the fee to totalFee
  for (let index = 0; index < extrinsics.length; index++) {
    const details = extrinsics[index];
    if (details.fees) {
      // Convert fee to BigInt (or Number if fee is smaller)
      totalFee += Number(details.fees); // Or use parseFloat(details.fee) for decimals
    }
  }

  const totalFeeUSD = totalFee * priceFeed.availPrice;
  dayDataRecord.totalFees = dayDataRecord.totalFees! + totalFee;
  dayDataRecord.totalFeesAvail = dayDataRecord.totalFeesAvail! + totalFee;
  dayDataRecord.totalFeesUSD = dayDataRecord.totalFeesUSD! + totalFeeUSD;
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
    dayDataRecord.totalDataBlocksCount =
      dayDataRecord.totalDataBlocksCount! + 1;
    dayDataRecord.totalDAFees = dayDataRecord.totalDAFees! + daFees;
    dayDataRecord.totalDAFeesUSD = dayDataRecord.totalDAFeesUSD! + daFeesUSD;
    dayDataRecord.totalDataSubmissionCount =
      dayDataRecord.totalDataSubmissionCount! + daSubmissions.length;
    dayDataRecord.totalByteSize = dayDataRecord.totalByteSize! + daSize || 0;
    dayDataRecord.totalBlocksCount = dayDataRecord.totalBlocksCount! + 1;

    dayDataRecord.save();
  }
}
