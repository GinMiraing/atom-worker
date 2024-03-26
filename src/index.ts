import { address, networks } from "bitcoinjs-lib";
import { AccountInfo, BitworkInfo, UTXO } from "./types";
import * as cbor from "borc";
import { detectAccountTypeFromScript } from "./lib/address-helper";
import {
  buildCommitTransaction,
  buildRevealTransaction,
  buildRevealTransactionOptions,
} from "./lib/script-build";
import { hasValidBitwork, isValidBitworkString } from "./lib/bitcoin-utils";

export const MAX_SEQUENCE = 0xffffffff;

export const buildTransaction = ({
  inscription,
  network,
  account,
  receiver,
  postagsFee,
  feeRate,
  utxos,
  sequence,
}: {
  inscription: {
    opType: "mint" | "burn" | "transfer";
    payload: any;
  };
  network: "bitcoin" | "testnet";
  account: {
    address: string;
    pubkey: string;
  };
  receiver: string;
  postagsFee: number;
  feeRate: number;
  utxos: UTXO[];
  sequence: number;
}) => {
  console.log("start build transaction");

  if (utxos.length === 0) {
    throw new Error("UTXO is empty");
  }

  if (sequence > MAX_SEQUENCE) {
    throw new Error("Sequence too large");
  }

  const accountScript = address.toOutputScript(
    account.address,
    network === "bitcoin" ? networks.bitcoin : networks.testnet
  );

  const accountInfo: AccountInfo = {
    address: account.address,
    network: network === "bitcoin" ? networks.bitcoin : networks.testnet,
    type: detectAccountTypeFromScript(accountScript),
    script: accountScript,
    pubkey: Buffer.from(account.pubkey, "hex"),
  };

  const args = inscription.payload?.args || {};
  let unixtime = Math.floor(Date.now() / 1000);
  let completeSequence = 0;

  let sequenceStart = sequence;
  let sequenceEnd = sequenceStart + 1000000;

  let commitBitworkInfo: BitworkInfo | null = null;
  let revealBitworkInfo: BitworkInfo | null = null;

  if (args["bitworkc"] && typeof args["bitworkc"] === "string") {
    commitBitworkInfo = isValidBitworkString(args["bitworkc"]);
  }

  if (args["bitworkr"] && typeof args["bitworkr"] === "string") {
    revealBitworkInfo = isValidBitworkString(args["bitworkr"]);
  }

  let commitTxIdMatched = !commitBitworkInfo;
  let commitTx: string | undefined;
  let commitTxId: string | undefined;

  const encodedPayload = cbor.encode(inscription.payload);
  const revealOptions = buildRevealTransactionOptions({
    inscription: {
      opType: inscription.opType,
      payload: encodedPayload,
    },
    network: accountInfo.network,
    feeRate,
    postagsFee,
  });

  do {
    if (completeSequence % 10000 === 0) {
      console.log("complete sequence", completeSequence);
      unixtime = Math.floor(Date.now() / 1000);
    }

    const commitTransaction = buildCommitTransaction({
      options: {
        network: accountInfo.network,
        feeRate,
        account: accountInfo,
        utxos,
      },
      revealTransactionOptions: revealOptions,
      sequence: completeSequence,
    });

    completeSequence++;

    if (
      !commitBitworkInfo ||
      hasValidBitwork(
        commitTransaction.commitTxId,
        commitBitworkInfo.prefix,
        commitBitworkInfo.ext
      )
    ) {
      commitTxIdMatched = true;
      commitTx = commitTransaction.commitPsbt.toHex();
      commitTxId = commitTransaction.commitTxId;
      console.log("commitTxId", commitTxId);
    }
  } while (!commitTxIdMatched && completeSequence < sequenceEnd);

  if (!commitTx) {
    throw new Error("Commit transaction not found");
  }

  let revealTx: string | undefined;
  let revealTxIdMatched = !revealBitworkInfo;

  if (revealTxIdMatched) {
    const revealTransaction = buildRevealTransaction({
      input: { hash: commitTxId, index: 0 },
      options: {
        network: accountInfo.network,
        receiver,
        postagsFee,
      },
      revealTransactionOptions: revealOptions,
      sequence,
    });

    revealTx = revealTransaction.revealPsbt.extractTransaction().toHex();
  } else {
    unixtime = Math.floor(Date.now() / 1000);
    completeSequence = sequenceStart;

    while (!revealTxIdMatched && completeSequence < sequenceEnd) {
      if (completeSequence % 10000 == 0) {
        console.log("complete sequence", completeSequence);
        unixtime = Math.floor(Date.now() / 1000);
      }

      const revealTransaction = buildRevealTransaction({
        input: { hash: commitTxId, index: 0 },
        options: {
          network: accountInfo.network,
          receiver,
          postagsFee,
        },
        revealTransactionOptions: revealOptions,
        sequence: completeSequence,
      });

      const revealTxId = revealTransaction.revealPsbt
        .extractTransaction()
        .getId();

      completeSequence++;

      if (
        !revealBitworkInfo ||
        hasValidBitwork(
          revealTxId,
          revealBitworkInfo.prefix,
          revealBitworkInfo.ext
        )
      ) {
        revealTxIdMatched = true;
        revealTx = revealTransaction.revealPsbt.extractTransaction().toHex();
        console.log("revealTxId", revealTxId);
      }
    }
  }

  if (!revealTx) {
    throw new Error("Reveal transaction not found");
  }

  return {
    commitTx,
    revealTx,
  };
};
