import {
  CollectiveDayData,
  CollectiveHourData,
  DataSubmission,
  Extrinsic,
  PriceFeedMinute,
} from "../../../types";
import { CorrectSubstrateBlock } from "../../mappingHandlers";

export async function handleHourData(
  block: CorrectSubstrateBlock,
  priceFeed: PriceFeedMinute,
  extrinsics: Extrinsic[],
  daSubmissions: DataSubmission[]
) {
  const blockDate = new Date(Number(block.timestamp.getTime()));
  const minuteId = Math.floor(blockDate.getTime() / 60000);
  const dayId = Math.floor(blockDate.getTime() / 86400000);
  const prevDayId = dayId - 1;
  const hourId = Math.floor(blockDate.getTime() / 3600000); // Divide by milliseconds in an hour
  const prevHourId = hourId - 1; // Divide by milliseconds in an hour

  let hourDataRecord = await CollectiveHourData.get(hourId.toString());
  if (hourDataRecord === undefined || hourDataRecord === null) {
    hourDataRecord = CollectiveHourData.create({
      id: hourId.toString(),
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
      prevHourDataId: prevHourId.toString(),
    });
  }

  hourDataRecord.avgAvailPrice =
    (hourDataRecord.avgAvailPrice! + priceFeed.availPrice) / 2;
  hourDataRecord.avgEthPrice =
    (hourDataRecord.avgEthPrice! + priceFeed.ethPrice) / 2;
  hourDataRecord.endBlock = block.block.header.number.toNumber();
  hourDataRecord.timestampLast = block.timestamp;
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
  hourDataRecord.totalFees = hourDataRecord.totalFees! + totalFee;
  hourDataRecord.totalFeesAvail = hourDataRecord.totalFeesAvail! + totalFee;
  hourDataRecord.totalFeesUSD = hourDataRecord.totalFeesUSD! + totalFeeUSD;
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
    hourDataRecord.totalDataBlocksCount =
      hourDataRecord.totalDataBlocksCount! + 1;
    hourDataRecord.totalDAFees = hourDataRecord.totalDAFees! + daFees;
    hourDataRecord.totalDAFeesUSD = hourDataRecord.totalDAFeesUSD! + daFeesUSD;
    hourDataRecord.totalDataSubmissionCount =
      hourDataRecord.totalDataSubmissionCount! + daSubmissions.length;
    hourDataRecord.totalByteSize = hourDataRecord.totalByteSize! + daSize || 0;
  }
  hourDataRecord.totalBlocksCount = hourDataRecord.totalBlocksCount! + 1;
  hourDataRecord.totalExtrinsicCount = hourDataRecord.totalExtrinsicCount! + 1;
  await hourDataRecord.save();
}
