// Resolving a binding in a checkout: the snapshot of the registered checkouts, the local target a binding leads to, and the checkout that holds a vault.
export { isPathWithin } from "#runtime/operations/binding-resolver.ts";
export type {
	LocalCodeTarget,
	LocalCodeTargetResult,
	OtherRef,
} from "#runtime/operations/binding-resolver.ts";
export {
	resolveLocalCodeTarget,
	resolveRegisteredCheckout,
	snapshotCheckoutAccess,
} from "#runtime/operations/checkout-snapshot.ts";
export type { CheckoutSnapshot } from "#runtime/operations/checkout-snapshot.ts";
export {
	checkoutsReadFrom,
	vaultIdentity,
	vaultRepositoryIdentity,
} from "#runtime/services/vault-checkout.ts";
