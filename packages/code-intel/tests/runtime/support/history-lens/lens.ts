// The readings of the history lens, which the package's tests drive one at a time. A test
// imports this module after it sets the registry, so the readings read that registry. A reading
// by name reads the document from the vault; a reading of variants takes them as a test built them.
export { readVariantFootprint } from "#runtime/history-lens/operations/footprint.ts";
export { createVariantLocality } from "#runtime/history-lens/operations/locality.ts";
