// The readings of the history lens, which the package's tests drive one at a time. A test
// imports this module after it sets the registry, so the readings read that registry.
export { createBehindReading } from "#runtime/operations/history-lens/behind.ts";
export { readFootprint } from "#runtime/operations/history-lens/footprint.ts";
export { createLocalityReading } from "#runtime/operations/history-lens/locality.ts";
