// Whether this process runs a checkout or a release, and where the parts of it are.
export {
	installation,
	programModule,
	releaseServerModule,
	resolveInstallation,
} from "#runtime/services/installation.ts";
export type { Installation, ReleaseMarker } from "#runtime/services/installation.ts";
