import ecc from "@bitcoinerlab/secp256k1";
import { initEccLib } from "bitcoinjs-lib";
import varuint from "varuint-bitcoin";

import { AccountInfo, UTXO } from "../types";
import { getInputExtra } from "./address-helper";

initEccLib(ecc);

type EstimateTxInput = {
  hash: Buffer;
  index: number;
  script?: Buffer;
  witness?: Buffer[];
};

type EstimateTxOutput = {
  script?: Buffer;
  value: number;
};

const bytesLength = (
  allowWitness: boolean,
  inputs: EstimateTxInput[],
  outputs: EstimateTxOutput[]
) => {
  const hasWitnesses =
    allowWitness &&
    inputs.some((input) => {
      return input.witness && input.witness.length !== 0;
    });

  const varSliceSize = (someScript: Buffer) => {
    const length = someScript.length;
    return varuint.encodingLength(length) + length;
  };

  const vectorSize = (vector: Buffer[]) => {
    const length = vector.length;
    return (
      varuint.encodingLength(length) +
      vector.reduce((sum, witness) => {
        return sum + varSliceSize(witness);
      }, 0)
    );
  };

  return (
    (hasWitnesses ? 10 : 8) +
    varuint.encodingLength(inputs.length) +
    varuint.encodingLength(outputs.length) +
    inputs.reduce(
      (sum, input) =>
        sum + 40 + (input.script ? varSliceSize(input.script) : 1),
      0
    ) +
    outputs.reduce(
      (sum, output) =>
        sum + 8 + (output.script ? varSliceSize(output.script) : 35),
      0
    ) +
    (hasWitnesses
      ? inputs.reduce((sum, input) => {
          return sum + vectorSize(input.witness || []);
        }, 0)
      : 0)
  );
};

export const estimateTxVbytes = (
  inputsOrCount: EstimateTxInput[] | number,
  outputsOrCount: EstimateTxOutput[] | number
) => {
  const inputs =
    typeof inputsOrCount === "number"
      ? Array.from({ length: inputsOrCount }, () => {
          return {
            hash: Buffer.alloc(32).fill(0),
            index: 0,
            witness: [Buffer.alloc(64).fill(0)],
          };
        })
      : inputsOrCount;

  const outputs =
    typeof outputsOrCount === "number"
      ? Array.from({ length: outputsOrCount }, () => {
          return {
            value: 0,
          };
        })
      : outputsOrCount;

  const base = bytesLength(false, inputs, outputs);
  const total = bytesLength(true, inputs, outputs);
  const weight = base * 3 + total;
  return Math.ceil(weight / 4);
};

export const sortUTXOsByDesire = (utxos: UTXO[], desireValue: number) => {
  return utxos.sort((a, b) => {
    if (a.value >= desireValue) {
      if (b.value >= desireValue) {
        if (a.value - desireValue < 546) return 1;
        return a.value - b.value;
      }
      return -1;
    }
    if (b.value >= desireValue) {
      return 1;
    }
    return b.value - a.value;
  });
};

export const coinselect = (
  paymentAccount: AccountInfo,
  utxos: UTXO[],
  targets: { script: Buffer; value: number }[],
  feeRate: number,
  extraInputs?: {
    value: number;
  }[]
) => {
  const feeUtxos = [...utxos];

  const totalTargetValue = targets.reduce((acc, target) => {
    return acc + target.value;
  }, 0);

  const feeInputs = [];
  let selectedValue =
    extraInputs?.reduce((sum, cur) => sum + cur.value, 0) || 0;
  let transactionFee = 0;
  while (true) {
    if (feeUtxos.length === 0) {
      throw new Error("No enough available UTXOs");
    }

    const vsize = estimateTxVbytes(
      [
        ...(Array.from({ length: extraInputs?.length || 0 }, () => ({
          hash: Buffer.alloc(32).fill(0),
          index: 0,
          witness: [Buffer.alloc(64).fill(0)],
        })) || []),
        ...(Array.from({ length: feeInputs.length + 1 }, () => ({
          hash: Buffer.alloc(32).fill(0),
          index: 0,
          script:
            paymentAccount.type === "p2sh"
              ? Buffer.alloc(23).fill(0)
              : undefined,
          witness:
            paymentAccount.type === "p2sh"
              ? [Buffer.alloc(71).fill(0), Buffer.alloc(33).fill(0)]
              : [Buffer.alloc(64).fill(0)],
        })) || []),
      ],
      [
        ...targets.map((target) => ({
          script: target.script,
          value: target.value,
        })),
        {
          value: 0,
          script: paymentAccount.script,
        },
      ]
    );
    transactionFee = Math.ceil(vsize * feeRate);
    const fee = totalTargetValue + transactionFee;
    const need = fee - selectedValue;
    sortUTXOsByDesire(feeUtxos, need);

    const utxo = feeUtxos.shift();
    if (!utxo) {
      throw new Error("No enough available UTXOs");
    }

    let feeInput = {
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: paymentAccount.script,
        value: utxo.value,
      },
      ...getInputExtra(paymentAccount),
    };

    feeInputs.push(feeInput);
    selectedValue += utxo.value;
    if (selectedValue >= fee) {
      break;
    }
  }

  const outputs = [...targets];

  const refund = selectedValue - totalTargetValue - transactionFee;

  if (refund >= 546) {
    outputs.push({
      script: paymentAccount.script,
      value: refund,
    });
  }

  return {
    feeInputs,
    outputs,
    transactionFee,
  };
};

export const randomBytes = (n: number) => {
  const buf = Buffer.allocUnsafe(n).fill(0);
  for (let i = 0; i < n; i++) {
    buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
};
