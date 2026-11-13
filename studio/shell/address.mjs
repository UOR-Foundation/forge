// The one content address Foundry mints: κ, the UORC object address `sha256:<64 hex>` (ADR-017 of
// PrismPM; the same κ a holo v5 names its objects by and an OCI registry names a layer by).
// Synchronous, so a derive callback and the core's restore rule can share it.
import { sha256HexSync } from "./prism-code/src/sha256.mjs";

export const ADDRESS = /^sha256:[0-9a-f]{64}$/;
export const isAddress = (value) => typeof value === "string" && ADDRESS.test(value);
const encoder = new TextEncoder();
/** κ of bytes, or of a string's UTF-8 bytes. */
export function kappa(bytes) {
  return "sha256:" + sha256HexSync(typeof bytes === "string" ? encoder.encode(bytes) : bytes);
}
