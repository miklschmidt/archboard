// Code facts (ADR 0046): the line where a binding's symbol is defined in the one file it names, which the code opener opens at.
export { symbolLine } from "#runtime/code-facts/operations/symbol-line.ts";
// How the calls an anchor names run their callee (TASK-663.09), which the upgrade inventory seeds `sync` or `async` from.
export { readCallTimings } from "#runtime/code-check/operations/call-timings.ts";
