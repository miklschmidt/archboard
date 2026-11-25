// Finding a vault from a directory, with or without registering what holds it, the layout that makes a directory a vault, and the checkout that holds one.
export {
	checkoutOfVault,
	findVault,
	isVaultLayout,
	vaultDirectory,
	vaultOrigins,
} from "#runtime/services/vault-finder.ts";
export type { BoundVault } from "#runtime/services/vault-finder.ts";
export { findAndRegisterVault } from "#runtime/services/vault-address.ts";
