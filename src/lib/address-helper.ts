import ecc from "@bitcoinerlab/secp256k1";
import * as bitcoin from "bitcoinjs-lib";
import * as bs58check from "bs58check";
import { sha256 } from "js-sha256";

import { AccountInfo } from "../types";

bitcoin.initEccLib(ecc);

export function detectAddressTypeToScripthash(address: string): {
  output: string;
  scripthash: string;
  address: string;
} {
  // Detect legacy address
  try {
    bitcoin.address.fromBase58Check(address);
    const p2pkh = addressToP2PKH(address);
    const p2pkhBuf = Buffer.from(p2pkh, "hex");
    return {
      output: p2pkh,
      scripthash: Buffer.from(sha256(p2pkhBuf), "hex")
        .reverse()
        .toString("hex"),
      address,
    };
  } catch (err) {}
  // Detect segwit or taproot
  // const detected = bitcoin.address.fromBech32(address);
  if (address.indexOf("bc1p") === 0) {
    const output = bitcoin.address.toOutputScript(address);
    return {
      output: output.toString("hex"),
      scripthash: Buffer.from(sha256(output), "hex").reverse().toString("hex"),
      address,
    };
  } else if (address.indexOf("bc1") === 0) {
    const output = bitcoin.address.toOutputScript(address);
    return {
      output: output.toString("hex"),
      scripthash: Buffer.from(sha256(output), "hex").reverse().toString("hex"),
      address,
    };
  } else if (address.indexOf("tb1") === 0) {
    const output = bitcoin.address.toOutputScript(
      address,
      bitcoin.networks.testnet
    );
    return {
      output: output.toString("hex"),
      scripthash: Buffer.from(sha256(output), "hex").reverse().toString("hex"),
      address,
    };
  } else if (address.indexOf("bcrt1p") === 0) {
    const output = bitcoin.address.toOutputScript(address);
    return {
      output: output.toString("hex"),
      scripthash: Buffer.from(sha256(output), "hex").reverse().toString("hex"),
      address,
    };
  } else {
    throw "unrecognized address";
  }
}

export function detectAddressType(address: string): boolean {
  try {
    bitcoin.address.fromBase58Check(address);
    return true;
  } catch (err) {}
  if (
    address.indexOf("bc1p") === 0 ||
    address.indexOf("bc1") === 0 ||
    address.indexOf("tb1") === 0 ||
    address.indexOf("bcrt1p") === 0
  ) {
    return true;
  } else {
    return false;
  }
}

export function addressToP2PKH(address: string): string {
  const addressDecoded = bs58check.decode(address);
  const addressDecodedSub = addressDecoded.toString().substr(2);
  const p2pkh = `76a914${addressDecodedSub}88ac`;
  return p2pkh;
}

export function detectScriptToAddressType(
  script: string,
  network?: bitcoin.Network
): string {
  const address = bitcoin.address.fromOutputScript(
    Buffer.from(script, "hex"),
    network || bitcoin.networks.bitcoin
  );
  return address;
}

const isP2TR = (
  script: Buffer,
  network: bitcoin.Network = bitcoin.networks.bitcoin
) => {
  try {
    bitcoin.payments.p2tr({ output: script, network });
    return true;
  } catch (e) {
    return false;
  }
};

const isP2PKH = (
  script: Buffer,
  network: bitcoin.Network = bitcoin.networks.bitcoin
) => {
  try {
    bitcoin.payments.p2pkh({ output: script, network });
    return true;
  } catch (e) {
    return false;
  }
};

const isP2WPKH = (
  script: Buffer,
  network: bitcoin.Network = bitcoin.networks.bitcoin
) => {
  try {
    bitcoin.payments.p2wpkh({ output: script, network });
    return true;
  } catch (e) {
    return false;
  }
};

const isP2SH = (
  script: Buffer,
  network: bitcoin.Network = bitcoin.networks.bitcoin
) => {
  try {
    bitcoin.payments.p2sh({ output: script, network });
    return true;
  } catch (e) {
    return false;
  }
};

const isP2WSH = (
  script: Buffer,
  network: bitcoin.Network = bitcoin.networks.bitcoin
) => {
  try {
    bitcoin.payments.p2wsh({ output: script, network });
    return true;
  } catch (e) {
    return false;
  }
};

const isP2MS = (
  script: Buffer,
  network: bitcoin.Network = bitcoin.networks.bitcoin
) => {
  try {
    bitcoin.payments.p2ms({ output: script, network });
    return true;
  } catch (e) {
    return false;
  }
};

const isP2PK = (
  script: Buffer,
  network: bitcoin.Network = bitcoin.networks.bitcoin
) => {
  try {
    bitcoin.payments.p2pk({ output: script, network });
    return true;
  } catch (e) {
    return false;
  }
};

export const detectAccountType = (
  address: string,
  network: bitcoin.Network = bitcoin.networks.bitcoin
) => {
  const script = bitcoin.address.toOutputScript(address, network);

  return detectAccountTypeFromScript(script, network);
};

export const detectAccountTypeFromScript = (
  script: Buffer,
  network: bitcoin.Network = bitcoin.networks.bitcoin
) => {
  if (isP2TR(script, network)) return "p2tr";
  if (isP2PKH(script, network)) return "p2pkh";
  if (isP2WPKH(script, network)) return "p2wpkh";
  if (isP2SH(script, network)) return "p2sh";
  if (isP2WSH(script, network)) return "p2wsh";
  if (isP2MS(script, network)) return "p2ms";
  if (isP2PK(script, network)) return "p2pk";

  return "unknown";
};

export const getP2SHRedeemScript = (pubkey: Buffer) => {
  return bitcoin.payments.p2wpkh({ pubkey }).output!;
};

export const toXOnly = (publicKey: Buffer) => {
  return publicKey.subarray(1, 33);
};

export const getInputExtra = (account: AccountInfo) => {
  if (account.type === "p2sh") {
    return { redeemScript: getP2SHRedeemScript(account.pubkey) };
  }

  if (account.type === "p2tr") {
    return { tapInternalKey: toXOnly(account.pubkey) };
  }

  return {};
};

export const reverseBuffer = (buffer: Buffer) => {
  if (buffer.length < 1) return buffer;
  let j = buffer.length - 1;
  let tmp = 0;
  for (let i = 0; i < buffer.length / 2; i++) {
    tmp = buffer[i];
    buffer[i] = buffer[j];
    buffer[j] = tmp;
    j--;
  }
  return buffer;
};
