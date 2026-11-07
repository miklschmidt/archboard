// What is known of checkouts: Git lookups of a directory, the repository registry (declare, forget, choose, list) with the vault it binds, and the language servers of a checkout.
export { checkoutHead, inspectCheckout, repoIdentityAt, repoRootOf } from "#runtime/clients/git.ts";
export { gitCheckoutOfVault } from "#runtime/clients/git-sync.ts";
export {
	checkoutServers,
	configureCommand,
	ConfiguredServerSchema,
	LanguageServersSchema,
	readServers,
	setServer,
} from "#runtime/store/language-servers.ts";
export type { ServerChoice, ServerFile, ServerScope } from "#runtime/store/language-servers.ts";
export { registryPath, RepoRegistryError } from "#runtime/store/registry-file.ts";
export type { RegisteredRepo } from "#runtime/store/registry-file.ts";
export {
	chooseKnownCheckout,
	chosenCheckouts,
	declareDirectory,
	forgetDirectory,
	listRegistry,
	repositoryOfVault as registeredRepositoryOfVault,
} from "#runtime/store/repo-registry.ts";
