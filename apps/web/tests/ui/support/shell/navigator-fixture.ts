// The navigator over a fixed listing, mounted through the real shell, and how a
// test reads its tree. Importing this registers the page's globals for the test
// file before React is loaded, and puts them away after its last test.

import { afterAll, afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { Root } from "react-dom/client";
import type { RepositoryEntry } from "@archboard/workspace/repositories";
import type { Model } from "@archboard/board/content";
import type {
	ShellActions,
	ShellPane,
	ShellRepository,
	ShellView,
} from "#ui/rules/shell/contracts.ts";
import type { AgentActivityEntry } from "#ui/rules/pane-session/session-types.ts";

// The page's globals come first: the menus decide whether there is a page to
// draw their popups on when they are loaded.
GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
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

/** The one repository most tests list: its identity, and its chosen checkout's vault. */
const SHOP = "github.com/acme/shop";
const SHOP_VAULT = "/work/shop/.archboard/vault";

/** The model each fixture repository exposes unless specified otherwise. */
const SHOP_MODEL: Model["manifest"] = { schemaVersion: 1, id: "Shop", name: "Shop", current: null };

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

/**
 * One repository with its canonical model and current agent activity.
 * @param repository The registered checkout choice.
 * @param model The model, or absence when it has none.
 * @param activity Current agent work in that vault.
 * @returns The shell entry.
 */
function repositoryOf(
	repository: RepositoryEntry,
	model: Model["manifest"] | undefined,
	activity: Readonly<Record<string, AgentActivityEntry>> = {},
): ShellRepository {
	return { repository, model, error: null, loading: false, activity };
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
	readonly model?: Model["manifest"];
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

/**
 * The shell's view of a workspace: the shop alone unless the test lists repositories.
 * @param workspace What the test stated.
 * @returns The view.
 */
function viewOf(workspace: Workspace): ShellView {
	const { model = SHOP_MODEL, agentActivity = {}, ...view } = workspace;
	return {
		theme: "light",
		repositories: [repositoryOf(ready(SHOP, SHOP_VAULT), model, agentActivity)],
		boardsError: null,
		boardsLoading: false,
		selectedBoardKey: null,
		panes: [pane("A", null)],
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
		 * Record a current model opened from its repository.
		 * @param model The stable model identity.
		 * @param repository Its registered repository.
		 * @returns That the pane accepted the reading.
		 */
		openModel: (model, repository) => {
			asked.selected.push(model);
			asked.opened.push(`${repository}|${model}`);
			return Promise.resolve(true);
		},
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
		addPane: ignore,
		closePane: ignore,
		present: ignore,
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
			lastChangeAt: null,
			doing: [],
			version: null,
		},
		stage: null,
		holder: null,
		boardName: null,
	};
}

/**
 * Read a repository row by its stable identity.
 * @param id The complete repository row identity.
 * @returns Its rendered row.
 */
function row(id: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`);
	if (found === null) throw new Error(`Missing row ${id}`);
	return found;
}

/**
 * The rows carrying a pane's letter.
 * @param letter The letter.
 * @returns Their ids, within the shop.
 */
function carrying(letter: string): string[] {
	return [...document.querySelectorAll(`[data-pane-letter="${letter}"]`)].map(
		(chip) => chip.closest<HTMLElement>('[role="treeitem"]')?.dataset["rowId"] ?? "",
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
	SHOP,
	SHOP_MODEL,
	SHOP_VAULT,
	act,
	carrying,
	mountNavigator,
	pane,
	press,
	ready,
	repositoryOf,
	row,
	unmount,
};
