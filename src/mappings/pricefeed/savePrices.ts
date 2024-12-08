import { PriceFeedMinute } from "../../types";

export async function handleNewPriceMinute({
  availPrice,
  ethPrice,
  ethBlock,
  availBlock,
  ethDate,
  availDate,
}: {
  availPrice: number;
  ethPrice: number;
  ethBlock: number;
  availBlock: number;
  ethDate: Date;
  availDate: Date;
}): Promise<PriceFeedMinute> {
  const blockDate = new Date(Number(availDate) * 1000);
  const minuteId = Math.floor(blockDate.getTime() / 60000);
  let priceFeedMinute = await PriceFeedMinute.get(minuteId.toString());
  if (priceFeedMinute === undefined || priceFeedMinute === null) {
    priceFeedMinute = PriceFeedMinute.create({
      id: minuteId.toString(),
      availPrice,
      ethPrice,
      availBlock,
      ethBlock,
      availDate,
      ethDate,
    });
  }
  priceFeedMinute.availPrice = availPrice;
  priceFeedMinute.ethPrice = ethPrice;

  // logger.info(
  //   `New ETH Price Feed Minute::::::  ${priceFeedMinute.ethPrice.toString()} :: ID:: ${minuteId} :: AT:: ${blockDate}`
  // );
  // logger.info(
  //   `New AVAIL Price Feed Minute::::::  ${priceFeedMinute.availPrice.toString()} :: ID:: ${minuteId} :: AT:: ${blockDate}`
  // );
  await priceFeedMinute.save();
  return priceFeedMinute;
}
