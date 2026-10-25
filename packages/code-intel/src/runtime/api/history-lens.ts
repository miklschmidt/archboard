// The history lens (ADR 0045): which parts change together, and the footprint of a range of commits. Each reading takes the board and its variants by name, and answers or refuses with a code of `HistoryRefusalCode` or the board store's own.
export { readFootprint } from "#runtime/operations/history-lens/footprint-reading.ts";
export { createLocalityReading } from "#runtime/operations/history-lens/locality.ts";
