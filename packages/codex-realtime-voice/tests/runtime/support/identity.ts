import {
	createIdentityAuthorities,
	type ChildEpoch,
	type ChildId,
	type IdentityAuthorities,
	type IdentityAuthority,
} from "@archboard/codex-app-server/identity";

/** The identity facts that an earlier process persisted for its child. */
interface PersistedIdentity {
	readonly childId: unknown;
	readonly epoch: unknown;
}

/**
 * Rebuilds authorities for a child and epoch that a test minted earlier, with an empty issuance
 * history, as a restarted host would hold them.
 * @param input - The child and epoch, as the test wrote or minted them.
 * @returns The identity and operation authorities.
 */
function restoreIdentityAuthorities(input: PersistedIdentity): IdentityAuthorities {
	return createIdentityAuthorities({
		childId: input.childId as ChildId,
		epoch: input.epoch as ChildEpoch,
		issued: new Map(),
		rawByIdentity: new Map(),
	});
}

/**
 * Rebuilds only the identity authority for a child and epoch that a test minted earlier.
 * @param input - The child and epoch, as the test wrote or minted them.
 * @returns The identity authority.
 */
function restoreIdentityAuthority(input: PersistedIdentity): IdentityAuthority {
	return restoreIdentityAuthorities(input).identity;
}

export { restoreIdentityAuthorities, restoreIdentityAuthority };
