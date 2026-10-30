// The readings of the history lens, which the package's tests drive one at a time. A test
// imports this module after it sets the registry, so the readings read that registry. A reading
// by name reads the board from the vault; a reading of variants takes them as a test built them.
export { createBehindReading } from "#runtime/operations/history-lens/behind.ts";
export { readVariantFootprint } from "#runtime/operations/history-lens/footprint.ts";
export { createVariantLocality } from "#runtime/operations/history-lens/locality.ts";
