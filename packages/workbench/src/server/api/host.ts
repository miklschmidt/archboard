// What the host of this server reads: the vault and the body that a request names, and where the server listens and how it names itself in a URL. Bun only.
export {
	browserServerUrl,
	findExistingLoopbackListener,
	formatHostForUrl,
	HOST,
	isLoopbackGuardedHost,
	logHttpServerError,
	PORT,
	serverUrl,
} from "#server/services/host/listener-address.ts";
export {
	bodyOf,
	isRecord,
	messageOf,
	queryString,
} from "#server/services/request/request-fields.ts";
export {
	namedVault,
	requireVault,
	statedVault,
	VAULT_PARAMETER,
	vaultOfRequest,
} from "#server/services/request/vault.ts";
export type { NamedVault } from "#server/services/request/vault.ts";
