// Resolving a binding in a checkout: the snapshot of the registered checkouts and the local target a binding leads to.
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
