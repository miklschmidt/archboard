// The server's side of the same contract: the vault a request or a socket upgrade names, made
// canonical once, or the refusal that says how to name one (ADR 0049). Bun only.
export { queryString } from "#server/services/request-fields.ts";
export {
	namedVault,
	requireVault,
	statedVault,
	vaultOfRequest,
	vaultOfUpgrade,
} from "#server/services/vault.ts";
