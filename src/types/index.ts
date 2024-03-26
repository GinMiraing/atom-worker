import { Network } from "bitcoinjs-lib";

export type AccountInfo = {
  address: string;
  network: Network;
  type:
    | "unknown"
    | "p2ms"
    | "p2pk"
    | "p2pkh"
    | "p2wpkh"
    | "p2wsh"
    | "p2sh"
    | "p2tr";
  pubkey: Buffer;
  script: Buffer;
};

export type UTXO = {
  txid: string;
  vout: number;
  value: number;
  scriptPubkey: string;
};

export type BitworkInfo = {
  inputBitwork: string;
  hexBitwork: string;
  prefix: string;
  ext: number | undefined;
};
