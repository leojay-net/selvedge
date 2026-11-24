import { KNOWN_ASSET_SYMBOLS } from "../constants.js";

const ADDRESS_PREFIX_LENGTH = 4;
const ADDRESS_SUFFIX_LENGTH = 4;
const ADDRESS_ELISION = "...";

export function shortenAddress(address: string): string {
  if (address.length <= ADDRESS_PREFIX_LENGTH + ADDRESS_SUFFIX_LENGTH + ADDRESS_ELISION.length) return address;
  return `${address.slice(0, ADDRESS_PREFIX_LENGTH)}${ADDRESS_ELISION}${address.slice(-ADDRESS_SUFFIX_LENGTH)}`;
}

export function formatAssetAmount(asset: string, rawUnits: bigint): string {
  const known = KNOWN_ASSET_SYMBOLS[asset];
  const magnitude = rawUnits < 0n ? -rawUnits : rawUnits;
  if (known === undefined) {
    return `${magnitude.toString()} units of ${shortenAddress(asset)}`;
  }
  const divisor = 10n ** BigInt(known.decimals);
  const wholePart = magnitude / divisor;
  const fractionPart = (magnitude % divisor).toString().padStart(known.decimals, "0").replace(/0+$/, "");
  const amountText = fractionPart.length > 0 ? `${wholePart.toString()}.${fractionPart}` : wholePart.toString();
  return `${amountText} ${known.symbol}`;
}


export function assetLabel(asset: string): string {
  return KNOWN_ASSET_SYMBOLS[asset]?.symbol ?? shortenAddress(asset);
}
