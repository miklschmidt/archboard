// The history lens (ADR 0045): how far each board is behind its code, which parts change together, and the footprint of a range of commits.
export { createBehindReading } from "#runtime/operations/history-lens/behind.ts";
export { readFootprint } from "#runtime/operations/history-lens/footprint.ts";
export type { FootprintRequest } from "#runtime/operations/history-lens/footprint.ts";
export { createLocalityReading } from "#runtime/operations/history-lens/locality.ts";
