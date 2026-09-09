// What the address bar says about the workspace: which panes are open, the
// board each one shows, and which pane is active. Pure. The address is browser
// display intent and never board authority (ADR 0015, ADR 0020): it records
// what is on screen and asks for what should be, and the note still decides.

/** One pane in an address: which pane, and the board it shows. */
interface AddressedPane {
	readonly paneId: string;
	/** The board key, or null while the pane has not said what it holds. */
	readonly boardKey: string | null;
}

/** Which panes are open, what each shows, and which one the person is on. */
interface WorkspaceAddress {
	readonly panes: readonly AddressedPane[];
	/** The active pane, or null when the address names none that is open. */
	readonly activePaneId: string | null;
}

/** One pane whose board must change to reach a wanted address. */
interface AddressOpen {
	readonly paneId: string;
	readonly boardKey: string;
}

/**
 * What has to happen for the displayed workspace to become the wanted one.
 * Ordered as it is applied: panes first, then boards, then focus.
 */
interface AddressPlan {
	/** How many panes the wanted address has that the displayed one has not. */
	readonly adds: number;
	readonly closes: readonly string[];
	readonly opens: readonly AddressOpen[];
	/** The pane to focus, or null when the displayed one is already right. */
	readonly focus: string | null;
}

const EMPTY_ADDRESS: WorkspaceAddress = Object.freeze({
	panes: Object.freeze([]),
	activePaneId: null,
});

/** The plan for an address that asks for nothing. */
const NOTHING_TO_DO: AddressPlan = Object.freeze({
	adds: 0,
	closes: Object.freeze([]),
	opens: Object.freeze([]),
	focus: null,
});

/**
 * A board key as the vault reads it (ADR 0010).
 * @param key The key.
 * @returns The key, trimmed, composed and lowercased.
 */
function normalisedKey(key: string): string {
	return key.trim().normalize("NFC").toLowerCase();
}

/**
 * Whether two board keys name the same board, as the vault reads names: an
 * address is normalised on the way through, and a key typed into a link or a
 * dialog is not the key that comes back.
 * @param shown The key a pane is showing, or null.
 * @param asked The key that was asked for.
 * @returns True when they are the same name.
 */
function sameBoardKey(shown: string | null, asked: string): boolean {
	return shown !== null && normalisedKey(shown) === normalisedKey(asked);
}

/**
 * The board one pane shows in an address.
 * @param address The address.
 * @param paneId The pane.
 * @returns The board key, or null when the pane is absent or says nothing.
 */
function boardIn(address: WorkspaceAddress, paneId: string): string | null {
	return address.panes.find((pane) => pane.paneId === paneId)?.boardKey ?? null;
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
 * @returns True when the panes, their boards and the active pane all match.
 */
function sameAddress(one: WorkspaceAddress, other: WorkspaceAddress): boolean {
	return (
		one.activePaneId === other.activePaneId &&
		one.panes.length === other.panes.length &&
		one.panes.every((pane, index) => {
			const against = other.panes[index];
			return against?.paneId === pane.paneId && against.boardKey === pane.boardKey;
		})
	);
}

/**
 * The address as it should be written down: panes that have not said what they
 * hold carry no board, and an active pane that is not open names nobody.
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
 * What has to happen for the displayed workspace to become the wanted one.
 *
 * A wanted pane that names no board is a pane that should be open, nothing
 * more: restoring never closes a board a person or an agent has since put
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
		pane.boardKey !== null && pane.boardKey !== boardIn(displayed, pane.paneId)
			? [{ paneId: pane.paneId, boardKey: pane.boardKey }]
			: [],
	);
	const adds = asked.panes.length - wantedOpen.length;
	const focus =
		asked.activePaneId !== null &&
		asked.activePaneId !== displayed.activePaneId &&
		hasAddressedPane(displayed, asked.activePaneId)
			? asked.activePaneId
			: null;
	return Object.freeze({ adds, closes, opens, focus });
}

/**
 * Whether a plan asks for nothing.
 * @param plan The plan.
 * @returns True when the displayed workspace already matches.
 */
function planIsEmpty(plan: AddressPlan): boolean {
	return plan.adds === 0 && plan.closes.length === 0 && plan.opens.length === 0 && !plan.focus;
}

/**
 * The panes a plan takes a board away from: the ones it closes and the ones it
 * points at another board. These are the panes the navigation guard preflights,
 * because each of them loses what is on its canvas (ADR 0022).
 * @param plan The plan.
 * @returns The pane ids, closes first, without repeats.
 */
function panesAtRisk(plan: AddressPlan): readonly string[] {
	const opened = plan.opens.map((open) => open.paneId).filter((id) => !plan.closes.includes(id));
	return [...plan.closes, ...opened];
}

export {
	EMPTY_ADDRESS,
	boardIn,
	sameBoardKey,
	hasAddressedPane,
	panesAtRisk,
	planFor,
	planIsEmpty,
	sameAddress,
	settledAddress,
	type AddressOpen,
	type AddressPlan,
	type AddressedPane,
	type WorkspaceAddress,
};
