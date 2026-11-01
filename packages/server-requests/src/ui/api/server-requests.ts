// The browser's one way of speaking JSON to the Archboard server: every call names its vault (ADR
// 0049), and a refusal is read the same way everywhere.
export { inVault, requestJson, strictReply } from "#ui/clients/server-requests.ts";
export type { ReplySchema } from "#ui/clients/server-requests.ts";
