// The repositories of this machine as the server answers `GET /api/repositories`, and the vault a pane opens in.
export {
	listRepositories,
	openingVault,
	placeOfVault,
	repositoryOfVault,
	vaultIn,
} from "#server/projections/repository-listing.ts";
