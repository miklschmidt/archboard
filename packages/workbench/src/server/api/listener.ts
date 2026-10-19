// Where this server listens, how it names itself in a URL, and where its source and built frontend are. Bun only.
export {
	findExistingLoopbackListener,
	formatHostForUrl,
	HOST,
	isLoopbackGuardedHost,
	logHttpServerError,
	PORT,
	serverUrl,
} from "#server/services/host/listener-address.ts";
export { moduleDir } from "#server/services/host/module-paths.ts";
