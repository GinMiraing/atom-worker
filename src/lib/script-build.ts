import {
  Network,
  Payment,
  Psbt,
  Transaction,
  initEccLib,
  opcodes,
  payments,
  address,
} from "bitcoinjs-lib";
import { Script } from "./script-class";
import ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory, ECPairInterface } from "ecpair";
import { coinselect, estimateTxVbytes, randomBytes } from "./bitcoin-utils";
import { toXOnly } from "./address-helper";
import { AccountInfo, UTXO } from "../types";

initEccLib(ecc);

const ECPair = ECPairFactory(ecc);

type RevealTransactionOptions = {
  scriptAddress: string;
  inputValue: number;
  p2pkRedeem: payments.Payment;
  p2pkP2tr: payments.Payment;
  revealKeypair: ECPairInterface;
};

const estimateRevealTxVsize = (p2tr: Payment) => {
  return estimateTxVbytes(
    [
      {
        hash: Buffer.alloc(32).fill(0),
        index: 0,
        witness: [Buffer.alloc(64).fill(0), ...p2tr.witness!],
      },
    ],
    1
  );
};

export const buildRevealTransactionOptions = ({
  inscriptions,
  network,
  feeRate,
  postagsFee,
}: {
  inscriptions: {
    opType: string;
    payload: Uint8Array;
  };
  network: Network;
  feeRate: number;
  postagsFee: number;
}): RevealTransactionOptions => {
  const revealKeypair = ECPair.fromPrivateKey(randomBytes(32), {
    network,
  });
  const revealPublicKey = toXOnly(revealKeypair.publicKey);
  const revealScript = buildRevealScript(revealPublicKey, inscriptions);

  const p2pkRedeem: Payment = {
    output: revealScript,
    redeemVersion: 192,
  };

  const p2pkP2tr = payments.p2tr({
    internalPubkey: toXOnly(revealKeypair.publicKey),
    scriptTree: {
      output: revealScript,
    },
    redeem: p2pkRedeem,
    network,
  });

  const scriptAddress = p2pkP2tr.address!;

  const revealTxVsize = estimateRevealTxVsize(p2pkP2tr);
  const revealTxFee = Math.ceil(revealTxVsize * feeRate);

  const inputValue = revealTxFee + postagsFee;

  return {
    scriptAddress,
    inputValue,
    p2pkRedeem,
    p2pkP2tr,
    revealKeypair,
  };
};

export const buildCommitTransaction = ({
  options,
  revealTransactionOptions,
  sequence,
}: {
  options: {
    network: Network;
    feeRate: number;
    account: AccountInfo;
    utxos: UTXO[];
  };
  revealTransactionOptions: RevealTransactionOptions;
  sequence: number;
}) => {
  const targets = [
    {
      script: address.toOutputScript(
        revealTransactionOptions.scriptAddress,
        options.network
      ),
      value: revealTransactionOptions.inputValue,
    },
  ];

  const { feeInputs, outputs } = coinselect(
    options.account,
    options.utxos,
    targets,
    options.feeRate
  );

  const commitPsbt = new Psbt({ network: options.network });

  feeInputs.forEach((input) => {
    commitPsbt.addInput(input);
  });

  outputs.forEach((output) => {
    commitPsbt.addOutput({
      script: output.script,
      value: output.value!,
    });
  });

  commitPsbt.setInputSequence(0, sequence);

  const commitTx = Transaction.fromBuffer(commitPsbt.data.getTransaction());
  const commitTxId = commitTx.getId();

  return {
    commitPsbt,
    commitTxId,
  };
};

export const buildRevealTransaction = ({
  input,
  options,
  revealTransactionOptions,
  sequence,
}: {
  input: {
    hash: string;
    index: number;
  };
  options: {
    network: Network;
    receiver: string;
    postagsFee: number;
  };
  revealTransactionOptions: RevealTransactionOptions;
  sequence: number;
}) => {
  const receiverScript = address.toOutputScript(
    options.receiver,
    options.network
  );

  const revealPsbt = new Psbt({ network: options.network });

  revealPsbt.addInput({
    hash: input.hash,
    index: input.index,
    witnessUtxo: {
      script: revealTransactionOptions.p2pkP2tr.output!,
      value: revealTransactionOptions.inputValue,
    },
    tapLeafScript: [
      {
        leafVersion: revealTransactionOptions.p2pkRedeem.redeemVersion!,
        script: revealTransactionOptions.p2pkRedeem.output!,
        controlBlock:
          revealTransactionOptions.p2pkP2tr.witness![
            revealTransactionOptions.p2pkP2tr.witness!.length - 1
          ],
      },
    ],
  });

  revealPsbt.addOutput({
    script: receiverScript,
    value: options.postagsFee,
  });

  revealPsbt.setInputSequence(0, sequence);

  revealPsbt.signInput(0, revealTransactionOptions.revealKeypair);
  revealPsbt.finalizeAllInputs();

  return {
    revealPsbt,
  };
};

export const buildRevealScript = (
  xonlyPublicKey: Buffer,
  inscription: {
    opType: string;
    payload: Uint8Array;
  }
) => {
  const protocol = "atom";

  const chunks = [];
  for (let i = 0; i < inscription.payload.length; i += 520) {
    chunks.push(inscription.payload.subarray(i, i + 520));
  }

  const revealScript = Script.new()
    .pushBytes(xonlyPublicKey)
    .pushByte(opcodes.OP_CHECKSIG)
    .pushByte(opcodes.OP_FALSE)
    .pushByte(opcodes.OP_IF)
    .pushString(protocol)
    .pushString(inscription.opType)
    .pushChunks(chunks)
    .pushByte(opcodes.OP_ENDIF);

  return revealScript.toBuffer();
};
