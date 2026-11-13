import type { Model } from "@archboard/model/content";

/** The states of one vault: its current state and its proposals. */
type VaultStates = Pick<Model, "manifest" | "proposals">;

/** One state that a footprint can be set against. */
interface AgainstChoice {
	readonly value: string;
	readonly label: string;
	readonly detail: string;
}

/**
 * The states a footprint can be set against: the current state first, then every proposal, of the
 * vault that the footprint reads.
 * @param read The states of that vault, once read.
 * @returns The choices.
 */
function againstChoices(read: VaultStates | undefined): readonly AgainstChoice[] {
	if (read === undefined) return [];
	const proposals = read.proposals.map((one) => ({
		value: one.id,
		label: one.name,
		detail: "Proposal",
	}));
	const { current } = read.manifest;
	if (current === null) return proposals;
	return [{ value: current.id, label: current.name, detail: "Current" }, ...proposals];
}

/**
 * Whether a vault holds a state.
 * @param read The states of the vault.
 * @param id The state.
 * @returns Whether it is the current state or one of the proposals.
 */
function holds(read: VaultStates, id: string | undefined): boolean {
	if (id === undefined) return false;
	return read.manifest.current?.id === id || read.proposals.some((one) => one.id === id);
}

/**
 * The state a footprint is set against when the reader chose none: the state on screen when the
 * vault that is read holds it, else the one proposal that the head adds over the merge base, else
 * the current state.
 * @param read The states of the vault that is read.
 * @param shown The state on screen.
 * @param before The states of the vault at the merge base, when they were read.
 * @returns The state, or null when the vault has none.
 */
function defaultAgainst(
	read: VaultStates,
	shown: string | undefined,
	before: VaultStates | undefined,
): string | null {
	if (shown !== undefined && holds(read, shown)) return shown;
	return addedProposal(read, before) ?? read.manifest.current?.id ?? null;
}

/**
 * The one proposal that a vault holds and the vault at the merge base does not.
 * @param read The states of the vault that is read.
 * @param before The states of the vault at the merge base, when they were read.
 * @returns The proposal, or undefined when there is none or more than one.
 */
function addedProposal(read: VaultStates, before: VaultStates | undefined): string | undefined {
	if (before === undefined) return undefined;
	const [only, other] = read.proposals.filter((one) => !holds(before, one.id));
	return other === undefined ? only?.id : undefined;
}

export { againstChoices, defaultAgainst, holds, type AgainstChoice, type VaultStates };
