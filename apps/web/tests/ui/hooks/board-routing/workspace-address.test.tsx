import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { settledAddress } from "#ui/rules/board-routing/address.ts";
import type { OpenOutcome, WorkspacePort } from "#ui/rules/board-routing/contracts.ts";

// The address bar owns the tab's history, so the document exists — on a real
// address, since a router reads one — before the router is taken, rather than
// above with the static imports.
GlobalRegistrator.register({ url: "http://localhost/" });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

const { createBoardRoutingHost } =
	await import("#ui/components/board-routing/BoardRoutingHost.tsx");
const { useWorkspaceAddress } = await import("#ui/hooks/board-routing/use-workspace-address.ts");

type Addressing = ReturnType<typeof useWorkspaceAddress>;
type Permission = Awaited<ReturnType<Addressing["claim"]>>;

/** Nobody is listening. */
function noop(): void {
	// Nothing to tell.
}

/** One pane, as the fake shell holds it. */
interface FakePane {
	paneId: string;
	boardKey: string | null;
	/** The repository the board is in, or null for the pane's own. */
	repository: string | null;
	/** The view a semantic board is being read through, or null. */
	view: string | null;
}

/** An open the fake server has been asked for and has not answered. */
interface HeldOpen {
	readonly paneId: string;
	readonly boardKey: string | null;
	readonly repository: string | null;
	readonly answer: (outcome: OpenOutcome) => void;
}

/**
 * The board the server says it opened. A test that wants an address spelled
 * one way and resolved another says so; otherwise it answers with what it was
 * asked for.
 */
interface FakeOpenAnswer {
	readonly reached: boolean;
	readonly openedKey?: string;
	/** The repository the server puts the pane in; the one it was asked for otherwise. */
	readonly repository?: string | null;
}

/** A shell whose workspace changes only when the test says so. */
interface FakeShell {
	/**
	 * Where the harness hears that the workspace changed.
	 * @returns How to stop listening.
	 */
	listen: (listener: () => void) => () => void;
	readonly panes: FakePane[];
	readonly opens: HeldOpen[];
	readonly unreachable: (string | null)[];
	/** What the address bar handed back, once it has mounted. */
	addressing: Addressing | null;
	/** Re-render the application with what the panes show now. */
	readonly render: () => Promise<void>;
	/** Answer the oldest open the server was given. */
	readonly answer: (answer: boolean | FakeOpenAnswer) => Promise<void>;
	/** The socket told a pane its board, and the shell rendered. */
	readonly adopt: (paneId: string, boardKey: string, repository?: string | null) => Promise<void>;
	readonly port: () => WorkspacePort;
}

/**
 * A shell that answers the address bar the way the real one does: pane changes
 * are visible after a render, and an open is answered by the server before the
 * pane is told about its board.
 * @param panes What the panes show to begin with.
 * @param activePaneId The focused pane.
 * @returns The fake.
 */
function fakeShell(
	panes: readonly (readonly [string, string | null])[],
	activePaneId = panes[0]?.[0] ?? "A",
): FakeShell {
	let active = activePaneId;
	let notify: () => void = noop;
	const shell: FakeShell = {
		/**
		 * Let the harness hear about a change.
		 * @param listener What to call.
		 * @returns How to stop listening.
		 */
		listen: (listener: () => void): (() => void) => {
			notify = listener;
			return (): void => {
				notify = noop;
			};
		},
		panes: panes.map(([paneId, boardKey]) => ({ paneId, boardKey, repository: null, view: null })),
		opens: [] as HeldOpen[],
		unreachable: [] as string[],
		addressing: null,
		/** Re-render the application. */
		render: async (): Promise<void> => {
			await act(async () => {
				notify();
				await new Promise<void>((resolve) => setTimeout(resolve, 0));
			});
		},
		/**
		 * Answer the oldest open.
		 * @param answer Whether the board was there, and which board it resolved to.
		 */
		answer: async (answer: boolean | FakeOpenAnswer): Promise<void> => {
			const open = shell.opens.shift();
			expect(open).toBeDefined();
			const given: FakeOpenAnswer = typeof answer === "boolean" ? { reached: answer } : answer;
			await act(async () => {
				open?.answer(
					given.reached
						? {
								kind: "opened",
								boardKey: given.openedKey ?? open.boardKey,
								repository: given.repository ?? open.repository,
							}
						: { kind: "unreachable" },
				);
			});
		},
		/**
		 * The socket told a pane its board.
		 * @param paneId The pane.
		 * @param boardKey The board it now shows.
		 * @param repository The repository it is in now; where it was when not said.
		 */
		adopt: async (paneId: string, boardKey: string, repository?: string | null): Promise<void> => {
			const pane = shell.panes.find((entry) => entry.paneId === paneId);
			if (pane) {
				pane.boardKey = boardKey;
				pane.repository = repository === undefined ? pane.repository : repository;
			}
			await shell.render();
		},
		/**
		 * The workspace as the address bar sees it now.
		 * @returns The port.
		 */
		port: (): WorkspacePort => ({
			displayed: settledAddress({
				panes: shell.panes.map((pane) => ({ ...pane })),
				activePaneId: active,
			}),
			paneIds: ["A", "B"],
			/**
			 * Whether a pane has reached the server.
			 * @returns True; every pane in these tests has.
			 */
			ready: (): boolean => true,
			/**
			 * Point a pane at a board; the answer waits for the test.
			 * @param paneId The pane.
			 * @param boardKey The board.
			 * @param repository The repository it is in, or null for the pane's own.
			 * @returns The outcome, once the test gives one.
			 */
			open: (
				paneId: string,
				boardKey: string | null,
				repository: string | null,
			): Promise<OpenOutcome> =>
				new Promise<OpenOutcome>((resolve) => {
					shell.opens.push({ paneId, boardKey, repository, answer: resolve });
				}),
			/**
			 * Read a pane's board another way.
			 * @param paneId The pane.
			 * @param view The view, or null for the whole variant.
			 * @returns Whether the reading changed.
			 */
			read: (paneId: string, view: string | null): boolean => {
				const pane = shell.panes.find((entry) => entry.paneId === paneId);
				if (pane === undefined || pane.view === view) {
					return false;
				}
				pane.view = view;
				return true;
			},
			/**
			 * Open the second pane.
			 * @returns Whether it opened.
			 */
			addPane: (): boolean => {
				if (shell.panes.length > 1) {
					return false;
				}
				shell.panes.push({ paneId: "B", boardKey: "scratch", repository: null, view: null });
				active = "B";
				return true;
			},
			/**
			 * Close a pane.
			 * @param paneId The pane.
			 * @returns Whether it closed.
			 */
			closePane: (paneId: string): boolean => {
				const at = shell.panes.findIndex((pane) => pane.paneId === paneId);
				if (at < 0 || shell.panes.length <= 1) {
					return false;
				}
				shell.panes.splice(at, 1);
				active = shell.panes[0]?.paneId ?? active;
				return true;
			},
			/**
			 * Focus a pane.
			 * @param paneId The pane.
			 * @returns Whether the focus moved.
			 */
			selectPane: (paneId: string): boolean => {
				if (active === paneId) {
					return false;
				}
				active = paneId;
				return true;
			},
			/**
			 * Boards nothing could reach.
			 * @param boards The boards.
			 */
			reportUnreachable: (boards): void => {
				shell.unreachable.push(...boards.map(({ boardKey }) => boardKey));
			},
		}),
	};
	return shell;
}

/**
 * Mount the address bar over a fake shell at a given address.
 * @param shell The shell.
 * @param search The query string the tab opens on.
 * @returns The React root, to unmount.
 */
async function mount(shell: FakeShell, search: string): Promise<Root> {
	window.history.replaceState(null, "", `/${search}`);
	/**
	 * The application, as far as the address bar is concerned.
	 * @returns Nothing; this harness only runs the hook.
	 */
	function Harness(): null {
		const [port, setPort] = useState(() => shell.port());
		useEffect(() => shell.listen(() => setPort(() => shell.port())), []);
		const addressing = useWorkspaceAddress(port);
		useEffect(() => {
			shell.addressing = addressing;
		}, [addressing]);
		return null;
	}
	// The harness renders nothing; the address bar is the whole subject.
	const Host = createBoardRoutingHost(Harness);
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(createElement(Host));
	});
	return root;
}

/**
 * The query string the address bar is showing.
 * @returns The search, without its leading question mark.
 */
function shownSearch(): string {
	return window.location.search.replace(/^\?/, "");
}

let mounted: Root | null = null;

/**
 * Let what is in flight settle, the way the application does between renders.
 * @returns Settles a few ticks later.
 */
async function settle(): Promise<void> {
	await act(async () => {
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	});
}

afterEach(async () => {
	if (mounted !== null) {
		const root = mounted;
		mounted = null;
		await act(async () => root.unmount());
	}
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

test("an open is not over when the server answers it, but when the pane is seen to move", async () => {
	const shell = fakeShell([["A", "payments"]]);
	mounted = await mount(shell, "?paneA=billing");
	expect(shell.opens.map((open) => open.boardKey)).toEqual(["billing"]);
	await shell.answer(true);
	await settle();
	// The note was read, but the pane is still showing payments. Writing the
	// address here would say payments, undoing what was asked for.
	expect(shownSearch()).toBe("paneA=billing");
	await shell.adopt("A", "billing");
	expect(shownSearch()).toBe("paneA=billing");
});

test("a user's gesture during a restore waits for the slot and is never stranded", async () => {
	const shell = fakeShell([["A", "payments"]]);
	mounted = await mount(shell, "?paneA=billing");
	expect(shell.opens).toHaveLength(1);
	// The user clicks while the restore's open is still in the air. Abandoning
	// the restore must not stop the address bar watching what it left running.
	let granted: Permission | null = null;
	const claimed = shell.addressing
		?.claim({ kind: "board", paneId: "A", from: "payments", repository: null })
		.then((permission) => {
			granted = permission;
			return permission;
		});
	await settle();
	expect(granted).toBeNull();
	await shell.answer(true);
	await shell.adopt("A", "billing");
	await claimed;
	expect(granted).not.toBeNull();
});

test("the slot is given to one waiting gesture at a time", async () => {
	const shell = fakeShell([["A", "payments"]]);
	mounted = await mount(shell, "?paneA=billing");
	const order: string[] = [];
	const first = shell.addressing
		?.claim({ kind: "board", paneId: "A", from: "payments", repository: null })
		.then((permission) => {
			order.push("first");
			return permission;
		});
	const second = shell.addressing
		?.claim({ kind: "board", paneId: "A", from: "payments", repository: null })
		.then((permission) => {
			order.push("second");
			return permission;
		});
	await shell.answer(true);
	await shell.adopt("A", "billing");
	const firstPermission = await first;
	expect(order).toEqual(["first"]);
	// The second is still waiting: the first has the slot until its own command
	// is over, so the server is never given two at once.
	if (firstPermission?.kind === "granted") {
		firstPermission.move.done("ledger", null);
	}
	await shell.adopt("A", "ledger");
	await second;
	expect(order).toEqual(["first", "second"]);
});

test("a user's open pushes a history entry only when it moved the pane", async () => {
	const shell = fakeShell([["A", "payments"]]);
	mounted = await mount(shell, "?paneA=payments");
	await settle();
	const before = window.history.length;
	// Opening the board the pane already shows is not a move to record.
	const noMove = await shell.addressing?.claim({
		kind: "board",
		paneId: "A",
		from: "payments",
		repository: null,
	});
	if (noMove?.kind === "granted") {
		noMove.move.done("payments", null);
	}
	await settle();
	expect(window.history.length).toBe(before);
	// An agent moving that pane afterwards is not their move either.
	await shell.adopt("A", "vendors");
	expect(shownSearch()).toBe("paneA=vendors");
	expect(window.history.length).toBe(before);
});

test("a board a restore cannot reach is named, and the address settles on what is shown", async () => {
	const shell = fakeShell([["A", "payments"]]);
	mounted = await mount(shell, "?paneA=nowhere");
	expect(shell.opens.map((open) => open.boardKey)).toEqual(["nowhere"]);
	await shell.answer(false);
	await settle();
	expect(shell.unreachable).toEqual(["nowhere"]);
	expect(shownSearch()).toBe("paneA=payments");
});

test("an open that had nothing to move gives the slot back rather than holding it", async () => {
	const shell = fakeShell([["A", "payments"]]);
	mounted = await mount(shell, "?paneA=payments");
	await settle();
	// Opening the board the pane already shows moves nothing, so there is
	// nothing to wait for; whoever asked next must not be left holding on.
	const first = await shell.addressing?.claim({
		kind: "board",
		paneId: "A",
		from: "payments",
		repository: null,
	});
	if (first?.kind === "granted") {
		first.move.done("payments", null);
	}
	const second = await shell.addressing?.claim({
		kind: "board",
		paneId: "A",
		from: "payments",
		repository: null,
	});
	expect(second?.kind).toBe("granted");
});

test("an address spelled one way and resolved another still gives the slot back", async () => {
	const shell = fakeShell([["A", "payments"]]);
	mounted = await mount(shell, "?paneA=payments");
	await settle();
	// `payments@current` and `payments` are one board; only the server knows
	// that, so it is the board it says it opened that decides whether the pane
	// has anything to move to.
	const first = await shell.addressing?.claim({
		kind: "board",
		paneId: "A",
		from: "payments",
		repository: null,
	});
	if (first?.kind === "granted") {
		first.move.done("payments", null);
	}
	const second = await shell.addressing?.claim({
		kind: "board",
		paneId: "A",
		from: "payments",
		repository: null,
	});
	expect(second?.kind).toBe("granted");
});

test("a restore whose board resolves to another spelling settles on what the pane shows", async () => {
	const shell = fakeShell([["A", "payments"]]);
	mounted = await mount(shell, "?paneA=payments@current");
	expect(shell.opens.map((open) => open.boardKey)).toEqual(["payments@current"]);
	// The server resolves the alias to the board the pane is already on, so
	// there is nothing to adopt and the address settles on what is shown.
	await shell.answer({ reached: true, openedKey: "payments" });
	await settle();
	expect(shownSearch()).toBe("paneA=payments");
});

test("a restore reads the view it names once the server says how it spells the board", async () => {
	const shell = fakeShell([["A", "payments"]]);
	// `Engine@current` and `engine` are one board and one variant, and only the
	// server knows it (ADR 0010, the `current` designation, a former name).
	mounted = await mount(shell, "?paneA=Engine@current&viewA=v1");
	await shell.answer({ reached: true, openedKey: "engine" });
	await shell.adopt("A", "engine");
	await settle();
	expect(shell.panes[0]?.view).toBe("v1");
	expect(new URLSearchParams(shownSearch()).get("viewA")).toBe("v1");
});

test("a person opening the same board in another repository has moved, and it waits for the pane and pushes", async () => {
	const shell = fakeShell([["A", "payments"]]);
	const pane = shell.panes[0];
	if (pane) pane.repository = "github.com/acme/shop";
	mounted = await mount(shell, "?paneA=payments&repoA=github.com%2Facme%2Fshop");
	await settle();
	const before = window.history.length;
	const permission = await shell.addressing?.claim({
		kind: "board",
		paneId: "A",
		from: "payments",
		repository: "github.com/acme/shop",
	});
	if (permission?.kind === "granted") {
		permission.move.done("payments", "github.com/acme/billing");
	}
	await settle();
	// The server answered, but the pane is still on the shop's board.
	expect(new URLSearchParams(shownSearch()).get("repoA")).toBe("github.com/acme/shop");
	await shell.adopt("A", "payments", "github.com/acme/billing");
	expect(new URLSearchParams(shownSearch()).get("repoA")).toBe("github.com/acme/billing");
	expect(window.history.length).toBe(before + 1);
});

test("a restore of the same board in another repository reads its view once the pane is there", async () => {
	const shell = fakeShell([["A", "pipeline"]]);
	const pane = shell.panes[0];
	if (pane) pane.repository = "github.com/acme/shop";
	mounted = await mount(shell, "?paneA=pipeline&repoA=lab&viewA=v1");
	expect(shell.opens.map((open) => open.repository)).toEqual(["lab"]);
	await shell.answer(true);
	await settle();
	// Not over yet: the pane has not reached the lab's board.
	expect(shownSearch()).toBe("paneA=pipeline&repoA=lab&viewA=v1");
	await shell.adopt("A", "pipeline", "lab");
	await settle();
	expect(shell.panes[0]?.view).toBe("v1");
	expect(shownSearch()).toBe("paneA=pipeline&repoA=lab&viewA=v1");
});
