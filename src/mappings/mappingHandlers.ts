import {
  SubstrateExtrinsic,
  SubstrateEvent,
  SubstrateBlock,
} from "@subql/types";
import { Account, Transfer } from "../types/models";

import { Balance } from "@polkadot/types/interfaces";
import { decodeAddress } from "@polkadot/util-crypto";
import { EthereumBlock } from "@subql/types-ethereum";
import { OneinchABIAbi__factory, OneinchABIAbi } from "../types/contracts";

const ENABLE_LOG = true;

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

export async function handleBlock(block: SubstrateBlock): Promise<void> {
  // logger.info(
  //   `New BLOCK AVAIL ::::::  ${block.block.header.number.toString()}`
  // );
  // logger.info(`New BLOCK AVAIL time::::::  ${block.timestamp}`);

  // Do something with each block handler here
  // Extrinsics
  // if (ENABLE_LOG)
  //   logger.info(`Block Extrinsics - ${block.block.extrinsics.length}`);

  const blockNumber = block.block.header.number.toNumber();
  const blockNumberString = blockNumber.toString();
  const blockHash = block.block.header.hash.toString();
  const extIdToDetails: {
    [key: number]: {
      nbEvents: number;
      success?: boolean;
      fee?: string;
      feeRounded?: number;
    };
  } = {};
  const daSubmissions = [];
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
    if (isDataSubmission) {
      let dataSubmissionSize =
        methodData.args.length > 0
          ? methodData.args[0].toString().length / 2
          : 0;
      logger.info(
        `New DATA AVAIL ::::::  ${dataSubmissionSize.toString()} APP:: ${extrinsic
          .inspect()
          .outer!.toString()} SIGNER :: ${extrinsic.signer.toString()}`
      );
      logger.info(`New DATA AVAIL ::::::  ${dataSubmissionSize.toString()}`);
      // idx,
      //   idx,
      //   block.timestamp,
      //   dataSubmissionSize,
      //   appId,
      //   ext.signer.toString();
    }
  });
}

// export async function handleCall(extrinsic: SubstrateExtrinsic): Promise<void> {
//   // Do something with a call handler here
// }

export async function handleEvent(event: SubstrateEvent): Promise<void> {
  // logger.info(
  //   `New transfer event found at block ${event.block.block.header.number.toString()}`
  // );
  // Get data from the event
  // The balances.transfer event has the following payload \[from, to, value\]
  // logger.info(JSON.stringify(event));
  //   const {
  //     event: {
  //       data: [from, to, amount],
  //     },
  //   } = event;
  //   const blockNumber: number = event.block.block.header.number.toNumber();
  //   const fromAccount = await checkAndGetAccount(from.toString(), blockNumber);
  //   const toAccount = await checkAndGetAccount(to.toString(), blockNumber);
  //   // Create the new transfer entity
  //   const transfer = Transfer.create({
  //     id: `${event.block.block.header.number.toNumber()}-${event.idx}`,
  //     blockNumber,
  //     date: event.block.timestamp,
  //     fromId: fromAccount.id,
  //     toId: toAccount.id,
  //     amount: (amount as Balance).toBigInt(),
  //   });
  //   fromAccount.lastTransferBlock = blockNumber;
  //   toAccount.lastTransferBlock = blockNumber;
  //   await Promise.all([fromAccount.save(), toAccount.save(), transfer.save()]);
}
async function checkAndGetAccount(
  id: string,
  blockNumber: number
): Promise<Account> {
  let account = await Account.get(id.toLowerCase());
  if (!account) {
    // We couldn't find the account
    account = Account.create({
      id: id.toLowerCase(),
      publicKey: decodeAddress(id).toString().toLowerCase(),
      firstTransferBlock: blockNumber,
    });
  }
  return account;
}
