// How a page starts: one decision, made before any pane exists. The address decides first.
// Then this browser's last reading does, if its repository can still be read. A machine that
// lists one repository with a model has nothing to choose. Everything else goes to the chooser,
// so no repository ever opens for being first in a list, and none that needs migration opens
// unless somebody asked for it.

import type { RepositoryModel } from "#ui/hooks/architecture-model/use-model-catalog.ts";
import type { AddressedPane, WorkspaceAddress } from "#ui/rules/reading-routing/address.ts";

/** A start that opens: the vault of each pane the address names, and of any other pane. */
interface OpenStart {
	readonly kind: "open";
	readonly vaults: Readonly<Record<string, string>>;
	readonly first: string;
}

/** How the page starts. */
type Start =
	| OpenStart
	/** The repositories or a summary have not answered, and what is awaited, when it is known. */
	| { readonly kind: "wait"; readonly destination: string | null }
	/** The last reading opens: the page takes its address, and then the address decides. */
	| {
			readonly kind: "restore";
			readonly address: WorkspaceAddress;
			readonly destination: string | null;
	  }
	/** Nothing decides. `missing` names what the address asked for and no repository holds. */
	| { readonly kind: "choose"; readonly missing: string | null };

/** What the start is decided from. */
interface StartInputs {
	/** The address the page is on. */
	readonly address: WorkspaceAddress;
	/** The last reading of this browser, or null. */
	readonly last: WorkspaceAddress | null;
	readonly repositories: readonly RepositoryModel[];
	/** The repositories have not answered yet. */
	readonly loading: boolean;
}

/** What is known of the repository of a pane. */
type Holder = RepositoryModel | "wait" | null;

/**
 * The repository a pane of an address reads. Its name decides. A pane that names none is read
 * from the only repository, or from the one that holds its model.
 * @param pane The pane.
 * @param repositories The repositories.
 * @returns The repository, nothing, or that a summary is still awaited.
 */
function holderOf(pane: AddressedPane, repositories: readonly RepositoryModel[]): Holder {
	if (pane.repository !== null) return named(pane.repository, repositories);
	if (repositories.length === 1) return repositories[0] ?? null;
	return pane.model === undefined ? null : modelHolder(pane.model.id, repositories);
}

/**
 * The repository that holds a model.
 * @param model The model.
 * @param repositories The repositories.
 * @returns It, nothing, or that a summary is still awaited.
 */
function modelHolder(model: string, repositories: readonly RepositoryModel[]): Holder {
	const holder = repositories.find((each) => each.model?.id === model);
	if (holder !== undefined) return holder;
	return repositories.some((each) => each.loading) ? "wait" : null;
}

/**
 * The repository of a name.
 * @param name The name.
 * @param repositories The repositories.
 * @returns It, or nothing.
 */
function named(name: string, repositories: readonly RepositoryModel[]): RepositoryModel | null {
	return repositories.find((each) => each.repository.name === name) ?? null;
}

/**
 * The vault a repository is read from.
 * @param holder The repository.
 * @returns Its vault, or null when its chosen checkout cannot be read.
 */
function vaultOf(holder: RepositoryModel | null): string | null {
	return holder?.repository.state === "ready" ? holder.repository.vault : null;
}

/**
 * What an address asks for, in words.
 * @param address The address.
 * @returns The repository or model of its first pane, or nothing.
 */
function askedFor(address: WorkspaceAddress): string | null {
	const pane = address.panes[0];
	return pane?.repository ?? pane?.model?.id ?? null;
}

/**
 * Start from an address that names panes. A pane it cannot place opens beside the panes that
 * it can, and states what it lacks, so the address stays explicit.
 * @param address The address.
 * @param repositories The repositories.
 * @returns The start.
 */
function addressedStart(
	address: WorkspaceAddress,
	repositories: readonly RepositoryModel[],
): Start {
	const holders = address.panes.map((pane) => [pane, holderOf(pane, repositories)] as const);
	if (holders.some(([, holder]) => holder === "wait"))
		return { kind: "wait", destination: askedFor(address) };
	const vaults = holders.flatMap(([pane, holder]) => {
		const vault = holder === "wait" ? null : vaultOf(holder);
		return vault === null ? [] : [[pane.paneId, vault] as const];
	});
	const [opened] = vaults;
	if (opened === undefined) return { kind: "choose", missing: askedFor(address) };
	return { kind: "open", vaults: Object.fromEntries(vaults), first: opened[1] };
}

/**
 * Whether the last reading still opens: each of its panes names a model that its repository
 * holds now. An address can name a repository that cannot be read. A default never does.
 * @param last The last reading.
 * @param repositories The repositories.
 * @returns Whether it opens, or that a summary is still awaited.
 */
function lastReadingOpens(
	last: WorkspaceAddress,
	repositories: readonly RepositoryModel[],
): boolean | "wait" {
	const holders = last.panes.map((pane) => [pane, holderOf(pane, repositories)] as const);
	if (holders.some(([, holder]) => holder === "wait" || holder?.loading === true)) return "wait";
	return holders.every(
		([pane, holder]) =>
			holder !== "wait" && vaultOf(holder) !== null && holder?.model?.id === pane.model?.id,
	);
}

/**
 * Start from nothing that names a repository.
 * @param repositories The repositories.
 * @returns The chooser, unless one repository with a model leaves nothing to choose.
 */
function unaddressedStart(repositories: readonly RepositoryModel[]): Start {
	const [only] = repositories;
	if (only === undefined || repositories.length > 1) return { kind: "choose", missing: null };
	if (only.loading) return { kind: "wait", destination: only.repository.name };
	const vault = only.model === undefined ? null : vaultOf(only);
	if (vault === null) return { kind: "choose", missing: null };
	return { kind: "open", vaults: {}, first: vault };
}

/**
 * Start from the last reading, unless it no longer opens.
 * @param last The last reading.
 * @param repositories The repositories.
 * @returns The start.
 */
function lastStart(last: WorkspaceAddress, repositories: readonly RepositoryModel[]): Start {
	const opens = lastReadingOpens(last, repositories);
	const destination = askedFor(last);
	if (opens === "wait") return { kind: "wait", destination };
	return opens ? { kind: "restore", address: last, destination } : unaddressedStart(repositories);
}

/**
 * Decide the start.
 * @param inputs The address, the last reading and the repositories.
 * @returns The start.
 */
function startOf(inputs: StartInputs): Start {
	const { address, last, repositories, loading } = inputs;
	if (loading) return { kind: "wait", destination: askedFor(address) };
	if (address.panes.length > 0) return addressedStart(address, repositories);
	return last === null ? unaddressedStart(repositories) : lastStart(last, repositories);
}

export { startOf, type OpenStart, type Start };
