// Finding the vault a command addresses, with or without registering what holds it, the vault a directory holds, the checkout that holds a vault, and where a vault is: its repository and the vault a pane in it belongs in.
export { checkoutOfVault, vaultDirectory, vaultIn } from "#runtime/services/vault-finder.ts";
export type { BoundVault } from "#runtime/services/vault-finder.ts";
export { findVault } from "#runtime/services/vault-address.ts";
export { placeOfVault } from "#server/projections/repository-listing.ts";
