// What is known of checkouts: Git lookups of a directory, the repository registry (declare, forget, choose, list) with the vault it binds, and the language server configuration of a repository.
export { GitCommandError } from "#runtime/clients/git-failure.ts";
export {
	checkoutHead,
	existingDir,
	inspectCheckout,
	repoIdentityAt,
	repoIdentityFor,
	repoRootOf,
} from "#runtime/clients/git.ts";
export type { CheckoutHead } from "#runtime/clients/git.ts";
export {
	configureCommand,
	ConfiguredServerSchema,
	LanguageServersSchema,
} from "#runtime/store/language-servers.ts";
export type { ConfiguredServer, LanguageServers } from "#runtime/store/language-servers.ts";
export { registryPath, RepoRegistryError } from "#runtime/store/registry-file.ts";
export type {
	RegisteredRepo,
	RegisteredRepoStatus,
	UntrackedVault,
} from "#runtime/store/registry-file.ts";
export {
	chooseKnownCheckout,
	chosenCheckouts,
	declareDirectory,
	forgetDirectory,
	listRegistry,
	repositoryOfVault as registeredRepositoryOfVault,
	setLanguageServer,
} from "#runtime/store/repo-registry.ts";
export type { RegistryListing } from "#runtime/store/repo-registry.ts";
