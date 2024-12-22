import { SubstrateExtrinsic } from "@subql/types";
import { AppEntity, Extrinsic, PriceFeedMinute } from "../../types";
import { CorrectSubstrateBlock } from "../mappingHandlers";
import { formatInspect } from "../../utils/inspect";
import { hexToUTF8 } from "../../utils";
import { handleAccount } from "./accountData";
import { handleAccountDayData } from "../intervals/day/handleDayData";
import { handleAppDayData } from "../intervals/day/handleAppDayData";
import { handleAppHourData } from "../intervals/hour/handleAppHourData";
import { handleAccountHourData } from "../intervals/hour/handleHourData";

export async function handleApp(
  extrinsicRecord: Extrinsic,
  extrinsic: Omit<SubstrateExtrinsic, "events" | "success">,
  priceFeed: PriceFeedMinute
) {
  const block = extrinsic.block as CorrectSubstrateBlock;
  const ext = extrinsic.extrinsic;
  const methodData = ext.method;

  let dataSubmissionSize =
    methodData.args.length > 0 ? methodData.args[0].toString().length / 2 : 0;
  const formattedInspect = formatInspect(ext.inspect());
  const filteredRaw = formattedInspect.map((x) => {
    return { ...x, data: "" };
  });
  const appIdInspect = formattedInspect.find((x) => x.name === "appId");
  const nameInspect = formattedInspect.find((x) => x.name === "key");
  const appNameKey = nameInspect
    ? hexToUTF8((nameInspect.value as string).split(" ")[1])
    : "Unknown";
  // const appName = formattedInspect.find((x) => x.name === "name");
  const appId = appIdInspect ? Number(appIdInspect.value) : -1;
  let appRecord = await AppEntity.get(appId.toString());
  // Handle new app
  if (appRecord === null || appRecord === undefined) {
    appRecord = AppEntity.create({
      id: appId.toString(),
      name: appNameKey,
      owner: ext.signer.toString(),
      creationRawData: JSON.stringify(filteredRaw),
      createdAt: block.timestamp,
      timestampCreation: extrinsicRecord.timestamp,
      timestampLast: extrinsicRecord.timestamp,
      totalByteSize: 0,
      updatedAt: extrinsicRecord.timestamp,
      avgAvailPrice: extrinsicRecord.availPrice,
      avgEthPrice: extrinsicRecord.ethPrice,
      totalDAFees: 0,
      totalDAFeesUSD: 0,
      totalDataSubmissionCount: 0,
      totalDataBlocksCount: 0,
      totalBlocksCount: 0,
      totalExtrinsicCount: 0,
      totalFeesAvail: 0,
      totalFeesUSD: 0,
      totalTransferCount: 0,
      lastPriceFeedId: priceFeed.id,
      endBlock: 0,
      startBlock: block.block.header.number.toNumber(),
    });
  }
  appRecord.timestampLast = extrinsicRecord.timestamp;

  appRecord.updatedAt = extrinsicRecord.timestamp;
  appRecord.avgAvailPrice =
    (appRecord.avgAvailPrice! + priceFeed.availPrice) / 2;
  appRecord.avgEthPrice = (appRecord.avgEthPrice! + priceFeed.ethPrice) / 2;
  const extrinsicType = `${methodData.section}_${methodData.method}`;
  const isDataSubmission = extrinsicType === "dataAvailability_submitData";
  const fees = Number(extrinsicRecord.fees);
  const feesUSD = fees * priceFeed.availPrice;
  if (methodData.section === "dataAvailability") {
    if (isDataSubmission) {
      appRecord.totalDAFees =
        appRecord.totalDAFees! + Number(extrinsicRecord.fees)!;
      appRecord.totalDAFeesUSD = appRecord.totalDAFeesUSD! + feesUSD;
      appRecord.totalDataSubmissionCount =
        appRecord.totalDataSubmissionCount! + 1;

      appRecord.totalByteSize =
        appRecord.totalByteSize + Number(dataSubmissionSize);
      if (
        appRecord.endBlock!.toString() !=
        block.block.header.number.toNumber().toString()
      ) {
        appRecord.totalDataBlocksCount = appRecord.totalDataBlocksCount! + 1;
      }
    }
  }
  if (
    appRecord.endBlock!.toString() !=
    block.block.header.number.toNumber().toString()
  ) {
    appRecord.totalBlocksCount = appRecord.totalBlocksCount! + 1;
  }
  appRecord.totalExtrinsicCount = appRecord.totalExtrinsicCount! + 1;
  appRecord.totalFeesAvail =
    appRecord.totalFeesAvail! + Number(extrinsicRecord.fees!);
  appRecord.totalFeesUSD = appRecord.totalFeesUSD! + Number(feesUSD);
  appRecord.lastPriceFeedId = priceFeed.id;
  appRecord.endBlock = block.block.header.number.toNumber();
  // logger.info(`New ACCOUNT SAVE::::::  ${JSON.stringify(appRecord)}`);
  // APP ACCOUNT HANDLE WITH   type: number = 0,  appRecord?: AppEntity
  await Promise.all([
    await handleAppDayData(extrinsicRecord, extrinsic, priceFeed, appRecord),
    await handleAppHourData(extrinsicRecord, extrinsic, priceFeed, appRecord),
    await handleAccount(extrinsicRecord, extrinsic, priceFeed, 1, appRecord),
    await handleAccountDayData(
      extrinsicRecord,
      extrinsic,
      priceFeed,
      1,
      appRecord
    ),
    await handleAccountHourData(
      extrinsicRecord,
      extrinsic,
      priceFeed,
      1,
      appRecord
    ),
    await appRecord.save(),
  ]);
}
