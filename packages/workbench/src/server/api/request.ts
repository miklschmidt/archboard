// What a request says about its board and its vault: the vault a call names, the body and query of a call and the refusal for a call that names none. Bun only.
export {
	boardOfRequest,
	bodyOf,
	bodyString,
	isRecord,
	messageOf,
	queryString,
} from "#server/services/request/board.ts";
export {
	namedVault,
	requireVault,
	statedVault,
	VAULT_PARAMETER,
	vaultOfRequest,
} from "#server/services/request/vault.ts";
export type { NamedVault } from "#server/services/request/vault.ts";
