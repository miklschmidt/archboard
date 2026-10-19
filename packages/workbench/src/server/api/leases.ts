// The ledger of the browser command leases that the panes of a server hold. Bun only.
export type { BrowserLeaseLedger } from "#server/protocol/gateway/contract.ts";
export { createBrowserLeaseLedger } from "#server/services/lease/lease.ts";
