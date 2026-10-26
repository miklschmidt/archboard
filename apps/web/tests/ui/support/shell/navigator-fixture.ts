// The navigator over a fixed listing, mounted through the real shell, and how a
// test reads its tree. Importing this registers the page's globals for the test
// file before React is loaded, and puts them away after its last test.

import { afterAll, afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { Root } from "react-dom/client";
import type { RepositoryEntry } from "@archboard/workspace/repositories";
import type { OutlineNode } from "#ui/rules/board-catalog/outline.ts";
import type {
	ShellActions,
	ShellPane,
	ShellRepository,
	ShellView,
} from "#ui/rules/shell/contracts.ts";
import type {
	AgentActivityEntry,
	BoardListing,
	CatalogBoard,
	ListedVariant,
} from "#ui/rules/pane-session/session-types.ts";

// The page's globals come first: the menus decide whether there is a page to
// draw their popups on when they are loaded.
GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { buildOutline } = await import("#ui/rules/board-catalog/outline.ts");
const { Shell } = await import("#ui/components/shell/Shell.tsx");

let root: Root;
afterEach(() => {
	unmount();
	document.body.replaceChildren();
	window.localStorage.clear();
});
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/** Take the mounted shell down, as the end of each test does. */
function unmount(): void {
	act(() => root.unmount());
}

/**
 * A listed variant.
 * @param boardKey The board's key.
 * @param id The variant id.
 * @param parentId Its predecessor, or null.
 * @param lifecycle Its standing.
 * @param opens Whether the board's bare name opens it.
 * @returns The variant.
 */
function variant(
	boardKey: string,
	id: string,
	parentId: string | null,
	lifecycle: ListedVariant["lifecycle"],
	opens = false,
): ListedVariant {
	return {
		id,
		name: `${boardKey} ${id}`,
		parentId,
		lifecycle,
		key: opens ? boardKey : `${boardKey}@${id}`,
	};
}

/**
 * A listed board with one current variant unless given more.
 * @param name Its name.
 * @param level Its level.
 * @param links The boards it drills down to.
 * @param variants Its variants; one current one when omitted.
 * @returns The board.
 */
function board(
	name: string,
	level: string,
	links: readonly string[] = [],
	variants?: readonly ListedVariant[],
): CatalogBoard {
	const key = name.toLowerCase();
	const listed = variants ?? [variant(key, "now", null, "current", true)];
	return {
		name,
		key,
		level,
		opens: listed.find((entry) => entry.key === key)?.id ?? null,
		variants: [...listed],
		links: links.map((target) => ({
			board: target,
			variant: null,
			node: target,
			container: false,
		})),
		description: null,
	};
}

/** A system that drills into a service, with a module under it, and a loose board. */
const BOARDS: readonly CatalogBoard[] = [
	board("Checkout", "system", ["Payments"]),
	board(
		"Payments",
		"service",
		["Ledger"],
		[
			variant("payments", "now", null, "current", true),
			variant("payments", "queued", "now", "draft"),
			variant("payments", "old", null, "historical"),
		],
	),
	board("Ledger", "module"),
	board("Audit", "service"),
];

/** The one repository most tests list: its identity, and its chosen checkout's vault. */
const SHOP = "github.com/acme/shop";
const SHOP_VAULT = "/work/shop/.archboard/vault";

/** The prefix of every row inside the shop repository. */
const IN_SHOP = `repository:${SHOP}|`;

/**
 * A repository whose chosen checkout is ready.
 * @param name Its identity.
 * @param vault Its chosen checkout's vault.
 * @returns The entry.
 */
function ready(name: string, vault: string): RepositoryEntry {
	const checkout = vault.replace("/.archboard/vault", "");
	return {
		name,
		untracked: false,
		vault,
		state: "ready",
		checkouts: [{ root: checkout, chosen: true, exists: true, hasVault: true }],
	};
}

/** The outline of each listing, built once as the application builds it once per listing. */
const outlines = new WeakMap<readonly CatalogBoard[], readonly OutlineNode<CatalogBoard>[]>();

/**
 * One repository as the shell lists it.
 * @param repository The repository.
 * @param boards Its boards.
 * @param activity What agents are doing in it, by board key.
 * @returns The shell's repository.
 */
function repositoryOf(
	repository: RepositoryEntry,
	boards: BoardListing,
	activity: Readonly<Record<string, AgentActivityEntry>> = {},
): ShellRepository {
	const outline = outlines.get(boards.boards) ?? buildOutline(boards.boards, boards.levels);
	outlines.set(boards.boards, outline);
	return { repository, boards, outline, error: null, loading: false, activity };
}

/** No unrelated shell behaviour is exercised here. */
function ignore(): void {
	return;
}

/** What the navigator asked the shell to do. */
interface Asked {
	readonly selected: string[];
	readonly beside: string[];
	/** Every open, as `repository|key`. */
	readonly opened: string[];
	/** Every checkout chosen, as `repository|root`. */
	readonly chosen: string[];
}

/** The workspace a test states: the shop's boards and activity, or every repository itself. */
interface Workspace extends Partial<ShellView> {
	readonly boards?: BoardListing;
	readonly agentActivity?: Readonly<Record<string, AgentActivityEntry>>;
}

/** What a mounted navigator asked for, and how to show it news. */
interface Mounted extends Asked {
	/**
	 * Draw the shell again with the same actions over a changed workspace.
	 * @param changes What changed.
	 */
	readonly show: (changes: Workspace) => void;
}

/** The shop's boards, as most tests list them. */
const SHOP_BOARDS: BoardListing = {
	boards: [...BOARDS],
	levels: ["system", "service", "module"],
	onScreen: [],
};

/**
 * The shell's view of a workspace: the shop alone unless the test lists repositories.
 * @param workspace What the test stated.
 * @returns The view.
 */
function viewOf(workspace: Workspace): ShellView {
	const { boards = SHOP_BOARDS, agentActivity = {}, ...view } = workspace;
	return {
		theme: "light",
		repositories: [repositoryOf(ready(SHOP, SHOP_VAULT), boards, agentActivity)],
		boardsError: null,
		boardsLoading: false,
		selectedBoardKey: "payments",
		panes: [pane("A", "payments")],
		activePaneId: "A",
		presentation: null,
		notices: [],
		...view,
	};
}

/**
 * Mount the real shell over a fixed listing.
 * @param overrides Workspace state for the behaviour under test.
 * @returns What the navigator asked for, and how to show it news.
 */
function mountNavigator(overrides: Workspace = {}): Mounted {
	const asked: Asked = { selected: [], beside: [], opened: [], chosen: [] };
	const actions: ShellActions = {
		setTheme: ignore,
		/**
		 * Record a board opened in the active pane.
		 * @param key The board key.
		 * @param _paneId The pane, which the navigator never names.
		 * @param repository The repository the board is in.
		 * @returns That the pane shows it.
		 */
		selectBoard: (key, _paneId, repository) => {
			asked.selected.push(key);
			asked.opened.push(`${repository}|${key}`);
			return Promise.resolve(true);
		},
		/**
		 * Record a board opened beside.
		 * @param key The board key.
		 * @param repository The repository the board is in.
		 */
		openBeside: (key, repository) => {
			asked.beside.push(key);
			asked.opened.push(`${repository}|${key}`);
		},
		/**
		 * Record a checkout chosen.
		 * @param repository The repository.
		 * @param checkout The checkout.
		 */
		chooseCheckout: (repository, checkout) => {
			asked.chosen.push(`${repository}|${checkout}`);
		},
		refreshBoards: ignore,
		selectPane: ignore,
		/**
		 * The navigator adds no pane.
		 * @returns False, always.
		 */
		addPane: (): boolean => false,
		closePane: ignore,
		present: ignore,
		takeBackControl: ignore,
		openSettings: ignore,
		selectNoticeAction: ignore,
		dismissNotice: ignore,
	};
	const workspace: Workspace = overrides;
	const container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	// A board's mark is its level's, drawn from the vault vocabulary the shell reads through its query cache.
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	/**
	 * Draw the shell over a view.
	 * @param shown The view.
	 */
	const draw = (shown: ShellView): void => {
		// The news a test shows keeps the listing, and so its outline.
		act(() =>
			root.render(
				createElement(
					QueryClientProvider,
					{ client },
					createElement(Shell, { view: shown, actions }),
				),
			),
		);
	};
	draw(viewOf(workspace));
	return {
		...asked,
		/**
		 * Draw the shell again with the same actions over a changed workspace.
		 * @param changes What changed.
		 */
		show: (changes) => {
			draw(viewOf({ ...workspace, ...changes }));
		},
	};
}

/**
 * One local pane.
 * @param paneId The pane.
 * @param boardKey What it shows, or null.
 * @param repository The repository the server says it is in: the shop unless said.
 * @param vault The vault it is in: the shop's unless said.
 * @returns The pane.
 */
function pane(
	paneId: string,
	boardKey: string | null,
	repository: string | null = SHOP,
	vault = SHOP_VAULT,
): ShellPane {
	return {
		status: {
			paneId,
			clientId: `${paneId}-client`,
			connected: true,
			registered: true,
			vault,
			repository,
			boardKey,
			opened: boardKey,
			board: null,
			view: null,
			presenting: false,
			lastChangeAt: null,
			doing: [],
			version: null,
		},
		stage: null,
		holder: null,
		takeBack: { kind: "idle" },
		boardName: null,
	};
}

/**
 * A row's id as the shop's outline spells it, without the repository it is in.
 * @param id The row's id in the tree.
 * @returns The id within the shop, or the id itself outside it.
 */
function inShop(id: string): string {
	return id.startsWith(IN_SHOP) ? id.slice(IN_SHOP.length) : id;
}

/**
 * The shop's rows as `kind:id@level`, in order, as its outline places them:
 * without the repository row they all sit under, one level up.
 * @returns The rows.
 */
function rows(): string[] {
	return [...document.querySelectorAll<HTMLElement>('[role="treeitem"]')]
		.filter((item) => item.dataset["rowId"]?.startsWith(IN_SHOP))
		.map(
			(item) =>
				`${item.dataset["rowKind"]}:${inShop(item.dataset["rowId"] ?? "")}@${Number(item.getAttribute("aria-level")) - 1}`,
		);
}

/**
 * A rendered row by its id.
 * @param id The row's id within the shop, or a whole id outside it.
 * @returns The row.
 */
function row(id: string): HTMLElement {
	const found =
		document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(IN_SHOP + id)}"]`) ??
		document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`);
	if (found === null) throw new Error(`Missing row ${id}`);
	return found;
}

/**
 * The lines a row draws to join it to what it sits under, as `shape` or `shape:lit`.
 * @param id The row id.
 * @returns One entry for each line drawn, outermost first.
 */
function guides(id: string): string[] {
	return [...row(id).querySelectorAll<HTMLElement>('[data-slot="tree-guide"]')].map(
		(line) => `${line.dataset["guide"]}${line.dataset["lit"] ? `:${line.dataset["lit"]}` : ""}`,
	);
}

/**
 * The rows carrying a pane's letter.
 * @param letter The letter.
 * @returns Their ids, within the shop.
 */
function carrying(letter: string): string[] {
	return [...document.querySelectorAll(`[data-pane-letter="${letter}"]`)].map((chip) =>
		inShop(chip.closest<HTMLElement>('[role="treeitem"]')?.dataset["rowId"] ?? ""),
	);
}

/**
 * Press a key on the focused element.
 * @param key The key.
 * @param altKey Whether Alt is held.
 */
function press(key: string, altKey = false): void {
	act(() => {
		document.activeElement?.dispatchEvent(
			new KeyboardEvent("keydown", { key, altKey, bubbles: true }),
		);
	});
}

export {
	BOARDS,
	SHOP,
	SHOP_BOARDS,
	SHOP_VAULT,
	act,
	board,
	carrying,
	guides,
	inShop,
	mountNavigator,
	pane,
	press,
	ready,
	repositoryOf,
	row,
	rows,
	unmount,
	variant,
};
