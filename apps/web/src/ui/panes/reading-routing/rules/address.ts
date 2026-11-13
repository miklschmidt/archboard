// What the address bar says about the workspace: which panes are open, the
// model each one shows, and which pane is active. Pure. The address is browser
// display intent and never model authority (ADR 0015, ADR 0020): it records
// what is on screen and asks for what should be, and the note still decides.

/** A canonical reading requested in one pane, including an unavailable reading. */
interface ModelAddress {
	readonly id: string;
	readonly scope: string | null;
	readonly checkpoint: string | null;
	/**
	 * The source branch or commit of a branch reading: the model as the vault holds it at that ref,
	 * read from Git and never written. Absent for the vault on disk.
	 */
	readonly ref?: string | undefined;
	readonly state?: string | undefined;
	readonly preview?: string | undefined;
	readonly bookmark?: string | undefined;
	readonly legacyAddress?: string | undefined;
	readonly against?: string | undefined;
	readonly subject?: string | undefined;
	readonly grammar?: string | undefined;
	readonly flow?: string | undefined;
	readonly focus?: readonly string[] | undefined;
	readonly hideKinds?: readonly string[] | undefined;
	/** The modules opened beside the scope in the same picture. */
	readonly expand?: readonly string[] | undefined;
	/** Set when the reader asked for every line, with any value. */
}

/** One pane in an address: which pane, the model it shows, and how it reads it. */
interface AddressedPane {
	readonly paneId: string;
	readonly model?: ModelAddress | undefined;
	/** The model key, or null while the pane has not said what it holds. */
	readonly paneKey: string | null;
	/**
	 * The repository the model is in (ADR 0050), by identity or by an untracked
	 * vault's registry name, never by a path; or null when the address does not
	 * say, which means the repository the pane is in.
	 */
	readonly repository: string | null;
	/**
	 * The view a legacy board is being read through, or null for the whole
	 * variant. Which explanation is on screen is part of what the pane is
	 * showing, not a preference about how to show it: a person who lands on a
	 * sequence and reloads has to get the sequence back, and a link that meant
	 * "the ordering, on this model" has to still mean that tomorrow.
	 */
	readonly view: string | null;
}

/** Which panes are open, what each shows, and which one the person is on. */
interface WorkspaceAddress {
	readonly panes: readonly AddressedPane[];
	/** The active pane, or null when the address names none that is open. */
	readonly activePaneId: string | null;
}

/** One pane whose model must change to reach a wanted address. */
interface AddressOpen {
	readonly paneId: string;
	readonly paneKey: string | null;
	readonly model?: ModelAddress;
	/** The repository the model is in, or null for the one the pane is in. */
	readonly repository: string | null;
}

/** One pane already on the right model, being read the wrong way. */
interface AddressRead {
	readonly paneId: string;
	/** The view to read it through, or null for the whole variant. */
	readonly view: string | null;
}

/**
 * The move a pane that names a model needs.
 * @param displayed What is on screen.
 * @param pane The wanted pane.
 * @param model The model it names.
 * @returns The move, when the pane is in another repository.
 */
function modelOpen(
	displayed: WorkspaceAddress,
	pane: AddressedPane,
	model: NonNullable<AddressedPane["model"]>,
): AddressOpen[] {
	const { paneId, repository } = pane;
	return repository !== null && repository !== repositoryIn(displayed, paneId)
		? [{ paneId, paneKey: null, model, repository }]
		: [];
}

/**
 * The move a pane that names a model, or only a repository, needs.
 * @param displayed What is on screen.
 * @param pane The wanted pane.
 * @returns The move, when the pane has to be pointed there.
 */
function placeOpen(displayed: WorkspaceAddress, pane: AddressedPane): AddressOpen[] {
	const { paneId, paneKey, repository } = pane;
	return (paneKey ?? repository) !== null && elsewhere(displayed, pane)
		? [{ paneId, paneKey, repository }]
		: [];
}

/**
 * What has to happen for the displayed workspace to become the wanted one.
 * Ordered as it is applied: panes first, then models, then focus.
 */
interface AddressPlan {
	/** How many panes the wanted address has that the displayed one has not. */
	readonly adds: number;
	readonly closes: readonly string[];
	readonly opens: readonly AddressOpen[];
	/**
	 * Panes showing the right model through the wrong view. Separate from the
	 * opens because changing which explanation is on screen takes nothing away:
	 * no canvas is replaced, so none of these panes is preflighted.
	 */
	readonly reads: readonly AddressRead[];
	/** The pane to focus, or null when the displayed one is already right. */
	readonly focus: string | null;
}

/** The plan for an address that asks for nothing. */
const NOTHING_TO_DO: AddressPlan = Object.freeze({
	adds: 0,
	closes: Object.freeze([]),
	opens: Object.freeze([]),
	reads: Object.freeze([]),
	focus: null,
});

/**
 * The model one pane shows in an address.
 * @param address The address.
 * @param paneId The pane.
 * @returns The model key, or null when the pane is absent or says nothing.
 */
function modelIn(address: WorkspaceAddress, paneId: string): string | null {
	return address.panes.find((pane) => pane.paneId === paneId)?.paneKey ?? null;
}

/**
 * The view one pane is reading its model through in an address.
 * @param address The address.
 * @param paneId The pane.
 * @returns The view, or null for the whole variant or a pane that is not open.
 */
function viewIn(address: WorkspaceAddress, paneId: string): string | null {
	return address.panes.find((pane) => pane.paneId === paneId)?.view ?? null;
}

/**
 * The repository one pane of an address is in.
 * @param address The address.
 * @param paneId The pane.
 * @returns Its repository, or null when the address does not say.
 */
function repositoryIn(address: WorkspaceAddress, paneId: string): string | null {
	return address.panes.find((pane) => pane.paneId === paneId)?.repository ?? null;
}

/**
 * Whether an address has a pane.
 * @param address The address.
 * @param paneId The pane.
 * @returns True when the pane is open in it.
 */
function hasAddressedPane(address: WorkspaceAddress, paneId: string): boolean {
	return address.panes.some((pane) => pane.paneId === paneId);
}

/**
 * Whether two addresses say the same thing.
 * @param one An address.
 * @param other The other.
 * @returns True when the panes, their models and the active pane all match.
 */
function sameAddress(one: WorkspaceAddress, other: WorkspaceAddress): boolean {
	return (
		one.activePaneId === other.activePaneId &&
		one.panes.length === other.panes.length &&
		one.panes.every((pane, index) => {
			const against = other.panes[index];
			return (
				against?.paneId === pane.paneId &&
				against.paneKey === pane.paneKey &&
				against.repository === pane.repository &&
				against.view === pane.view &&
				sameModelAddress(against.model, pane.model)
			);
		})
	);
}

/**
 * Compare exact canonical reading intent without inspecting model content.
 * @param one One requested reading.
 * @param other The other requested reading.
 * @returns Whether both identify the same reading.
 */
function sameModelAddress(one: ModelAddress | undefined, other: ModelAddress | undefined): boolean {
	if (one === other) return true;
	if (one === undefined || other === undefined) return false;
	return (
		(
			[
				"id",
				"scope",
				"checkpoint",
				"ref",
				"state",
				"preview",
				"bookmark",
				"legacyAddress",
				"against",
				"subject",
				"grammar",
				"flow",
			] as const
		).every((field) => one[field] === other[field]) &&
		(["focus", "hideKinds", "expand"] as const).every((field) =>
			sameSubjects(one[field], other[field]),
		)
	);
}

/**
 * Compare ordered focus identities without relying on array reference identity.
 * @param one One focused reading.
 * @param other The other focused reading.
 * @returns Whether both carry the same explicit focus.
 */
function sameSubjects(one: ModelAddress["focus"], other: ModelAddress["focus"]): boolean {
	return one?.join(",") === other?.join(",");
}

/**
 * Canonical readers consume the router directly, including explicit missing states.
 * @param displayed Actual open panes and their server-owned legacy boards.
 * @param requested Canonical reading intent from the router.
 * @returns Actual panes with their requested canonical locations preserved.
 */
function withModelAddresses(
	displayed: WorkspaceAddress,
	requested: WorkspaceAddress,
): WorkspaceAddress {
	return {
		...displayed,
		panes: displayed.panes.map((pane) => {
			const wanted = requested.panes.find((entry) => entry.paneId === pane.paneId);
			if (wanted?.model === undefined) return pane;
			return {
				...pane,
				paneKey: null,
				view: null,
				model: wanted.model,
				repository: wanted.repository ?? pane.repository,
			};
		}),
	};
}

/**
 * The address as it should be written down: panes that have not said what they
 * hold carry no model, and an active pane that is not open names nobody.
 * @param address The address.
 * @returns The address with its active pane checked.
 */
function settledAddress(address: WorkspaceAddress): WorkspaceAddress {
	const active =
		address.activePaneId !== null && hasAddressedPane(address, address.activePaneId)
			? address.activePaneId
			: (address.panes[0]?.paneId ?? null);
	return Object.freeze({ panes: address.panes, activePaneId: active });
}

/**
 * Whether a wanted pane is on another model than the displayed one: another
 * key, or the same key in another repository. An address that names no
 * repository asks for the model in whichever repository the pane is in.
 * @param displayed What is on screen.
 * @param pane The wanted pane.
 * @returns True when the pane has to be pointed somewhere.
 */
function elsewhere(displayed: WorkspaceAddress, pane: AddressedPane): boolean {
	if (pane.paneKey !== modelIn(displayed, pane.paneId)) return true;
	return pane.repository !== null && pane.repository !== repositoryIn(displayed, pane.paneId);
}

/**
 * What has to happen for the displayed workspace to become the wanted one.
 *
 * A wanted pane that names no model is a pane that should be open, nothing
 * more: restoring never closes a model a person or an agent has since put
 * there. A displayed pane the wanted address does not have is closed.
 * @param displayed What is on screen.
 * @param wanted What the address asks for.
 * @param paneIds The panes this shell can have.
 * @returns The plan.
 */
function planFor(
	displayed: WorkspaceAddress,
	wanted: WorkspaceAddress,
	paneIds: readonly string[],
): AddressPlan {
	// An address naming no pane this shell can have asks for no workspace —
	// which is what a bare `/` is, and what `?paneZ=x` is too. Neither is a
	// request to close the panes that are open.
	const asked = {
		panes: wanted.panes.filter((pane) => paneIds.includes(pane.paneId)),
		activePaneId: wanted.activePaneId,
	};
	if (asked.panes.length === 0) {
		return NOTHING_TO_DO;
	}
	const closes = displayed.panes
		.filter((pane) => !hasAddressedPane(asked, pane.paneId))
		.map((pane) => pane.paneId);
	const wantedOpen = asked.panes.filter((pane) => hasAddressedPane(displayed, pane.paneId));
	const opens = wantedOpen.flatMap((pane) =>
		pane.model === undefined ? placeOpen(displayed, pane) : modelOpen(displayed, pane, pane.model),
	);
	// A pane the address is about to point at another model is not read here as
	// well: the view it should end up on is a view of the model it is going to,
	// and the reading is settled once that model is there.
	const moving = new Set(opens.map((open) => open.paneId));
	const reads = wantedOpen.flatMap((pane) =>
		!moving.has(pane.paneId) && pane.view !== viewIn(displayed, pane.paneId)
			? [{ paneId: pane.paneId, view: pane.view }]
			: [],
	);
	const adds = asked.panes.length - wantedOpen.length;
	const focus =
		asked.activePaneId !== null &&
		asked.activePaneId !== displayed.activePaneId &&
		hasAddressedPane(displayed, asked.activePaneId)
			? asked.activePaneId
			: null;
	return Object.freeze({ adds, closes, opens, reads, focus });
}

/**
 * Whether a plan asks for nothing.
 * @param plan The plan.
 * @returns True when the displayed workspace already matches.
 */
function planIsEmpty(plan: AddressPlan): boolean {
	return (
		plan.adds === 0 &&
		plan.closes.length === 0 &&
		plan.opens.length === 0 &&
		plan.reads.length === 0 &&
		!plan.focus
	);
}

export {
	withModelAddresses,
	modelIn,
	repositoryIn,
	viewIn,
	planFor,
	planIsEmpty,
	sameAddress,
	settledAddress,
	type AddressOpen,
	type AddressPlan,
	type AddressedPane,
	type ModelAddress,
	type WorkspaceAddress,
};
