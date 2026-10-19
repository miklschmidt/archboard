// Code facts (ADR 0046): what one file of a checkout defines, as the code opener finds the line of a symbol.
export type { FileFacts } from "#runtime/operations/code-facts/facts.ts";
export { findSymbol } from "#runtime/operations/code-facts/lookup.ts";
export { createCodeFacts } from "#runtime/services/code-facts/reader.ts";
