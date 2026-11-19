// What the host of this server reads: the vault that a request names, and where the server listens and how it names itself in a URL. Bun only.
export {
	findExistingLoopbackListener,
	formatHostForUrl,
	isLoopbackGuardedHost,
	listenAddress,
	logHttpServerError,
	serverUrl,
} from "#server/host/services/listener-address.ts";
export { messageOf, queryString } from "#server/request/services/request-fields.ts";
export {
	namedVault,
	requireVault,
	vaultOfRequest,
	vaultOfUpgrade,
} from "#server/request/services/vault.ts";
