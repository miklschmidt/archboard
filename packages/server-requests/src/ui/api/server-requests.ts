// The browser's one way of speaking JSON to the Archboard server: every call names its vault (ADR
// 0049), a refusal is read the same way everywhere, and the page learns the vault it opens in once.
export {
	inVault,
	learnServedVault,
	requestJson,
	servedVault,
	strictReply,
} from "#ui/clients/server-requests.ts";
export type { ReplySchema } from "#ui/clients/server-requests.ts";
