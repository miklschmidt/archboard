import { CliUsageError, type AnyCommandContract } from "../command-contract/contract.js";
import { exportContract } from "../command-contract/export.js";
import { queryContract } from "../command-contract/query.js";
import { updateContract, WRITE_ANSWER } from "../command-contract/update.js";
import { viewportContract } from "../command-contract/viewport.js";
import { statusContract } from "../command-contract/status.js";
import { boardSaveContract } from "../command-contract/board-save.js";
import { runCommand } from "../command-contract/runner.js";
import {
	BOARD_REFUSAL_CODES,
	boardHoldSeen,
	formatBoardRefusal,
	setExpectedVersion,
	setRequestedBoard,
	setWriteDoing,
} from "../../runtime/engine/canvas-client.js";
import { packageVersion } from "../../runtime/engine/package-version.js";
import { startContract, stopContract } from "./server.js";
import { addContract, applyContract, deleteContract, getContract } from "./elements.js";
import * as scene from "./scene.js";
import { panesContract, selectionContract } from "./selection.js";
import * as paneCommands from "./pane.js";
import { promote, demote } from "./promote.js";
import * as repoCommands from "./repo.js";
import * as snapshotCommands from "./snapshot.js";
import * as boardCommands from "./board.js";
import { compareContract } from "./compare.js";
import { changesContract } from "./changes.js";
import { claim, release } from "./claim.js";
import * as injectCommands from "./inject.js";
import * as arrangeCommands from "./arrange.js";
import { installSkillContract } from "./install-skill.js";
import * as libraryCommands from "./library.js";
import { childDiscoveryOptions } from "./args.js";

type LegacyParserOwner = "legacy args.ts" | "legacy custom parser" | "legacy subcommand dispatch";

interface LegacyCommand {
	kind: "legacy";
	handler: (argv: string[]) => Promise<void>;
	handlerOwner: string;
	parserOwner: LegacyParserOwner;
	legacyArgv: "root-tail" | "route-tail";
}

interface ContractCommand {
	kind: "contract";
	contract: AnyCommandContract;
	handlerOwner: string;
}

type RouteOwner = LegacyCommand | ContractCommand;

interface CommandRoute {
	owner: RouteOwner;
	summary?: string;
	usage?: string;
	children?: Readonly<Record<string, CommandRoute>>;
	bare?:
		| { kind: "default"; child: string; withLeadingOptions: boolean }
		| { kind: "namespace-refusal"; message: string };
	childDiscovery?: {
		kind: "first-positional";
		options: Readonly<Record<string, "flag" | "value">>;
	};
}

const commandSummary = (route: CommandRoute) =>
	route.summary ??
	(route.owner.kind === "contract" ? route.owner.contract.summary : "Legacy command");
const commandUsage = (route: CommandRoute) =>
	route.usage ?? (route.owner.kind === "contract" ? route.owner.contract.usage : "");

const legacy = (
	handler: (argv: string[]) => Promise<void>,
	handlerOwner: string,
	legacyParserOwner: LegacyParserOwner = "legacy args.ts",
	legacyArgv: LegacyCommand["legacyArgv"] = "root-tail",
): LegacyCommand => ({
	kind: "legacy",
	handler,
	handlerOwner,
	parserOwner: legacyParserOwner,
	legacyArgv,
});

const contract = (value: AnyCommandContract, handlerOwner: string): ContractCommand => ({
	kind: "contract",
	contract: value,
	handlerOwner,
});

const child = (owner: RouteOwner): CommandRoute => ({ owner });

const COMMANDS: Record<string, CommandRoute> = {
	start: {
		owner: contract(startContract, "src/cli/commands/server.ts"),
	},
	stop: {
		owner: contract(stopContract, "src/cli/commands/server.ts"),
	},
	status: {
		owner: contract(statusContract, "src/cli/command-contract/status.ts"),
	},
	apply: {
		owner: contract(applyContract, "src/cli/commands/elements.ts"),
		summary: "Apply a {create,update,delete} patch as a single write",
		usage: [
			"apply [patch.json|-] [--document]",
			"  (update entries accept direct fields or {id,set:{...}})",
			"",
			WRITE_ANSWER,
		].join("\n"),
	},
	add: {
		owner: contract(addContract, "src/cli/commands/elements.ts"),
		summary: "Create elements from a JSON array",
		usage: [
			"add [elements.json] (or stdin) [--document]",
			'add --one \'{"type":"rectangle",...}\'',
			"",
			WRITE_ANSWER,
		].join("\n"),
	},
	update: {
		owner: contract(updateContract, "src/cli/command-contract/lib/command-definitions.ts"),
	},
	delete: {
		owner: contract(deleteContract, "src/cli/commands/elements.ts"),
		summary: "Delete elements by id",
		usage: [
			"delete <id> [<id> ...] [--document]",
			"",
			"  A label goes with the shape it names, so `deleted` can be longer than what you",
			"  named, and anything bound to what has gone is unbound and comes back in",
			"  `elements`.",
			"",
			WRITE_ANSWER,
		].join("\n"),
	},
	get: {
		owner: contract(getContract, "src/cli/commands/elements.ts"),
		summary: "Get one element by id",
		usage: "get <id>",
	},
	query: {
		owner: contract(queryContract, "src/cli/command-contract/lib/command-definitions.ts"),
	},
	selection: {
		owner: contract(selectionContract, "src/cli/commands/selection.ts"),
		summary: "What a human currently has selected on the board",
		usage: "selection [--text]",
	},
	panes: {
		owner: contract(panesContract, "src/cli/commands/selection.ts"),
		summary: "What the human is currently looking at — pane by pane",
		usage: [
			"panes [--text]",
			"",
			"  One entry per pane on screen, in reading order: where it sits (left/right/top/bottom),",
			"  which board and variant it holds, how much of that board is in view, and what is selected",
			'  in it. This is how "the left one" and "move that box over there" get resolved by something',
			"  that cannot see the screen.",
			"",
			"  VIEW STATE ONLY — it never lists elements, so it stays cheap enough to call every turn.",
			"  Use `describe` for what is on a board and `selection` for the full detail of one pick.",
			"  No pane at all is normal: it means no browser is open, not that anything is wrong.",
		].join("\n"),
	},
	promote: {
		owner: legacy(promote, "src/cli/commands/promote.ts"),
		summary: "Declare the selected elements a node: kind, identity, binding",
		usage: [
			'promote --kind service|queue|datastore|gateway|external [--ids a,b,c] [--name "Payments"] [--node payments]',
			"        [--path src/payments/service.ts] [--repo host/owner/name] [--branch main] [--commit sha]",
			"        [--variant current] [--level system|service|module] [--each] [--text]",
			"",
			"  The default target is the live selection; --each makes one node per selected shape.",
			"",
			"  A BINDING NAMES A REPOSITORY, not a directory (ADR 0011). --path takes an absolute path, or a",
			"  repo-relative path with --repo naming a registered checkout (`repo add`), or a path relative to",
			"  the directory you are standing in. That last one says which repository that turned out to be,",
			"  because it is the one the caller did not name. Naming the repo is what lets one board bind",
			"  nodes in five of them without a single `cd`.",
		].join("\n"),
	},
	pane: {
		owner: legacy(paneCommands.pane, "src/cli/commands/pane.ts", "legacy subcommand dispatch"),
		children: {
			open: child(
				legacy(paneCommands.paneOpen, "src/cli/commands/pane.ts", "legacy args.ts", "route-tail"),
			),
			close: child(
				legacy(paneCommands.paneClose, "src/cli/commands/pane.ts", "legacy args.ts", "route-tail"),
			),
		},
		bare: {
			kind: "namespace-refusal",
			message:
				"pane needs a subcommand: open, close. For what is on screen right now, without changing it, run `archboard panes`.",
		},
		summary: "Split the canvas into another pane, or close one",
		usage: [
			"pane open [--board <key>] | pane close <left|right|1|2|primary|focused|pane id>",
			"",
			"  A pane is a slot holding one board, and two panes are how the architecture that exists sits",
			"  beside a proposal. Layout used to be a click in the browser, so a thread that could only",
			"  talk had one pane and reused it — which meant overwriting the board the human was reading.",
			"",
			"  `pane open --board <key>` is the whole side-by-side move in one command: it makes a new pane",
			"  and opens that board into it. It CANNOT target an existing pane, so it cannot overwrite one.",
			"  With no --board the new pane shows whatever was already on screen, like pressing Split.",
			"",
			"  Two panes is the limit the shell lays out. A pane exists only while a browser tab is",
			"  rendering it, so both of these need one open and exit 4 when there is none — nothing here",
			"  invents a pane on a headless canvas. Closing a pane takes a board off the screen and does",
			"  nothing to the board itself; the last pane cannot be closed.",
			"",
			"  `archboard panes` (plural) is the read: which pane holds which board, and what is in view.",
		].join("\n"),
	},
	viewport: {
		owner: contract(viewportContract, "src/cli/command-contract/lib/command-definitions.ts"),
	},
	demote: {
		owner: legacy(demote, "src/cli/commands/promote.ts"),
		summary: "Turn nodes back into plain elements",
		usage:
			"demote [--ids a,b,c] [--text]  (default target is the live selection; demotes every element of each node it touches)",
	},
	repo: {
		owner: legacy(repoCommands.repo, "src/cli/commands/repo.ts", "legacy subcommand dispatch"),
		children: {
			list: child(
				legacy(repoCommands.repoList, "src/cli/commands/repo.ts", "legacy args.ts", "route-tail"),
			),
			add: child(
				legacy(repoCommands.repoAdd, "src/cli/commands/repo.ts", "legacy args.ts", "route-tail"),
			),
			forget: child(
				legacy(repoCommands.repoForget, "src/cli/commands/repo.ts", "legacy args.ts", "route-tail"),
			),
		},
		bare: { kind: "default", child: "list", withLeadingOptions: true },
		summary:
			"The repository checkouts on this machine, so a binding can name a repo instead of a directory",
		usage: [
			"repo list [--text] | repo add [dir] | repo forget <identity>",
			"",
			"  A binding is a repository identity plus a path inside it, never a directory on one machine.",
			"  Boards live in a vault that spans repositories and is meant to be readable from any of them",
			"  (ADR 0004). This is where archboard writes down where each repository actually is HERE.",
			"",
			"  Register a checkout and it can be named from anywhere: `promote --repo github.com/acme/payments",
			"  --path src/service.ts` resolves without standing in it, which is what makes a system board",
			"  covering five repositories buildable in one session (ADR 0011). archboard also learns as it",
			"  goes: every binding that resolves through an absolute path records where that repo was found.",
			"",
			"  `add` takes the identity from git (origin, else the directory name) and never from you, because",
			"  two people naming one clone differently is what would make the addresses useless. With no",
			"  argument it registers the directory you are standing in.",
		].join("\n"),
	},
	board: {
		owner: legacy(boardCommands.board, "src/cli/commands/board.ts", "legacy subcommand dispatch"),
		children: {
			list: child(
				legacy(
					boardCommands.boardList,
					"src/cli/commands/board.ts",
					"legacy args.ts",
					"route-tail",
				),
			),
			info: child(
				legacy(
					boardCommands.boardInfo,
					"src/cli/commands/board.ts",
					"legacy args.ts",
					"route-tail",
				),
			),
			new: child(
				legacy(boardCommands.boardNew, "src/cli/commands/board.ts", "legacy args.ts", "route-tail"),
			),
			open: child(
				legacy(
					boardCommands.boardOpen,
					"src/cli/commands/board.ts",
					"legacy args.ts",
					"route-tail",
				),
			),
			save: child(contract(boardSaveContract, "src/cli/command-contract/board-save.ts")),
		},
		bare: {
			kind: "namespace-refusal",
			message: "board needs a subcommand: list, info, new, open, save",
		},
		summary: "Load, save and list boards in the vault",
		usage: [
			"board list [--repo <host/owner/name> | --here] [--text]",
			"        | info | new <name> [--variant v] [--level system|service|module] [--pane <spec>]",
			"        | open <name[@variant]> [--variant v] [--reload] [--pane <spec>]",
			"        | save --board <key> [--as <name>] [--variant v] [--level l] [--force]",
			"",
			"  A board is one .excalidraw.md note in the vault at ARCHBOARD_VAULT; a PANE holds one at a time,",
			"  and two panes hold two — which is what side-by-side current-vs-proposed is. --pane takes left,",
			"  right, top, bottom, a 1-based position, primary, or a pane id, and is required once more than",
			"  one pane is open; with a single pane the board goes there, with none it is loaded unshown.",
			'  The variant "current" owns the bare name — the architecture that exists. Every other variant is',
			"  addressed and stored as name@variant, so three-way option comparison is just three names.",
			"",
			"  WHICH BOARDS DESCRIBE THIS CODE: `board list --here` from inside a repository, or",
			"  `board list --repo host/owner/name` from anywhere, answers from the bindings on the boards",
			"  rather than from their names, so a system board covering five repositories is found from any",
			"  of the five. Each match lists the nodes bound to that repo. A binding made a minute ago counts:",
			"  a promotion is a write, and a write is in the note.",
			"  BRANCHING (`save --as name@variant` or `save --variant v`) writes a second board and moves",
			"  nothing on screen: you branched in order to compare, so the source stays where it is and the",
			"  branch is put up with `board open` (ADR 0012). The level comes across unless --level says",
			"  otherwise. The one save that does move a pane is naming the scratch board, and the answer says",
			"  which pane it moved either way.",
			"",
			"  WRITES ARE CHECKED, NOT LOCKED. Every write goes to the note, and archboard verifies that the",
			"  destination still holds the bytes it last wrote there. If the note changed underneath —",
			"  Obsidian, a sync client, another editor — the write is refused, nothing is written, and a save",
			"  exits 5 naming three ways out: reload the note (`board open <name> --reload`), overwrite it",
			"  (`--force`), or keep both (`--as <other>`). archboard never picks for you. Nothing is locked,",
			"  so keep a board open in one editor at a time: the check catches a changed file, not a copy in",
			"  another app's memory.",
		].join("\n"),
	},
	compare: {
		owner: contract(compareContract, "src/cli/commands/compare.ts"),
		summary: "Structured semantic diff between two variants of a board",
		usage: [
			"compare <from> [to]        e.g. compare payments payments@option-a",
			"",
			"  Diffs two boards on NODE IDENTITY (customData.archboard.node), not on element ids or",
			"  geometry, so two variants authored independently still compare. Nodes and edges added,",
			"  removed, changed (with what changed about each) and unchanged; layout expressed as",
			"  relative structure — who sits with whom, what contains what, what is grouped, whereabouts,",
			"  relative direction, relative size — never as coordinate deltas. The output names what that",
			"  model deliberately cannot express, under layout.cannotExpress.",
			"",
			"  Output is JSON and complete: nothing is summarised into prose and nothing is truncated,",
			"  because the caller is expected to narrate it. Elements that are not nodes have no identity",
			"  across boards, so they are inventoried per side rather than diffed.",
			"",
			"  With one address the other side is found among that board's variants in the vault, and the",
			'  "current" variant is always the from side. Neither board is opened, and both are read from',
			"  their notes; `source` says whether a side is a board this canvas has open, and so possibly on",
			"  screen in front of somebody, or one that only exists in the vault.",
		].join("\n"),
	},
	changes: {
		owner: contract(changesContract, "src/cli/commands/changes.ts"),
		summary:
			"Semantic changes on the board since a cursor — what it became, not which pixels moved",
		usage: [
			"changes --board <key> [--since <cursor>] [--coalesce] [--detail] [--text]",
			"",
			"  Nodes and edges added, removed, changed, promoted, rerouted; layout as relative structure",
			"  (who sits with whom, what contains what, whereabouts, which side of what) — the same",
			"  vocabulary `compare` uses, on one board across time instead of two boards side by side.",
			"",
			"  A drag is ONE event, reported when the board settles, or none at all: element deltas never",
			"  surface, and a change that is only colour or a nudge too small to mean anything is not an",
			"  event. Nothing is emitted for it and the baseline does not move, so small movements still",
			"  add up until they cross a threshold.",
			"",
			"  Cursor-based, for a caller that runs once per turn and remembers where it got to. Pass the",
			"  cursor from the last response as --since; --coalesce answers with one net diff from there",
			"  to now instead of a replay of every event in between.",
		].join("\n"),
	},
	claim: {
		owner: legacy(claim, "src/cli/commands/claim.ts"),
		summary: "Take a board for a stretch of work, so twenty writes are one uninterrupted act",
		usage: [
			'claim --board <key> --reason "redrawing the payment path" [--for 10m]',
			"",
			"  FOR WORK YOU KNOW IN ADVANCE IS SUBSTANTIAL, and for nothing smaller. An ordinary write",
			"  already takes the board for as long as it takes to write, so there is nothing to claim for",
			"  moving one box. What a claim buys is the twenty writes in between: taking and releasing the",
			"  board twenty times leaves nineteen gaps for somebody else to write into, and a board that is",
			"  never once in the state you meant it to be in.",
			"",
			"  NOTHING TO CARRY. Every write you make to this board while the claim stands goes under the",
			"  claim, because the board is named on it. Claim again to extend, with the reason brought up to",
			"  date; a write does not extend it. --for takes a unit (90s, 10m, 1h), and defaults to ten",
			"  minutes.",
			"",
			"  THE PERSON AT THE CANVAS CAN TAKE IT BACK AT ANY MOMENT, from the pane, which shows your",
			"  reason. Your next act is then refused once and says so, and NOTHING IS ROLLED BACK: every",
			"  write you made is in the note. So leave the board sensible after each write, or do the work",
			"  on a variant and swap when it is done. Stop when you are told; do not claim it again to",
			"  finish.",
		].join("\n"),
	},
	release: {
		owner: legacy(release, "src/cli/commands/claim.ts"),
		summary: "Give back a board you claimed",
		usage: [
			"release --board <key>",
			"",
			"  Ends the claim. The board goes back to being taken one write at a time, and everything you",
			"  wrote stays where it is. Releasing a claim that has expired, or that somebody took back, is",
			"  not an error — it answers `released: false`.",
		].join("\n"),
	},
	inject: {
		owner: legacy(
			injectCommands.inject,
			"src/cli/commands/inject.ts",
			"legacy subcommand dispatch",
		),
		children: {
			status: child(
				legacy(
					injectCommands.injectStatus,
					"src/cli/commands/inject.ts",
					"legacy args.ts",
					"route-tail",
				),
			),
			test: child(
				legacy(
					injectCommands.injectTest,
					"src/cli/commands/inject.ts",
					"legacy args.ts",
					"route-tail",
				),
			),
		},
		bare: { kind: "default", child: "status", withLeadingOptions: false },
		summary:
			"Whether the canvas can push board changes into a live Codex thread, and a probe to prove it",
		usage: [
			'inject status | inject test [--note "..."] [--loud]',
			"",
			"  Board changes reach a running Codex thread through the app-server control socket, quietly:",
			"  `thread/inject_items` appends to the thread's history without starting a turn, so the agent",
			"  sees the change next time it speaks and nothing is interrupted.",
			"",
			"  OFF unless the canvas server was started with ARCHBOARD_INJECT=1, and off regardless when the",
			"  canvas is bound to anything but loopback — anything that can reach the canvas could otherwise",
			"  drive the coding agent (ADR 0005). Both are decided at server start; there is nothing to turn",
			"  on from here. `status` says which of those applies, and which thread would be told.",
			"",
			"  `test` injects a message that says it is a test, for checking the wiring without touching a",
			"  board. --loud sends it through `turn/steer` instead, for that one probe.",
		].join("\n"),
	},
	describe: {
		owner: contract(scene.describeContract, "src/cli/commands/scene.ts"),
		summary: "AI-readable scene description (plain text)",
		usage: "describe",
	},
	screenshot: {
		owner: legacy(scene.screenshot, "src/cli/commands/scene.ts"),
		summary: "Capture one pane (needs an open browser tab)",
		usage: [
			"screenshot [--out file.png] [--format png|svg] [--no-background] [--pane <spec>]",
			"",
			"  A picture of one pane, so with two on screen it takes --pane left|right|1|2 to say which",
			"  half. Without it the pane that answers for the browser is photographed, which with a single",
			"  pane is that pane — and with two is the one you may not have drawn in.",
		].join("\n"),
	},
	export: {
		owner: contract(exportContract, "src/cli/command-contract/lib/command-definitions.ts"),
	},
	import: {
		owner: contract(scene.importContract, "src/cli/commands/scene.ts"),
		summary: "Import a .excalidraw or Obsidian .excalidraw.md file (merge by default)",
		usage: "import [scene.excalidraw|note.excalidraw.md|-] [--replace] (or stdin)",
	},
	mermaid: {
		owner: legacy(scene.mermaid, "src/cli/commands/scene.ts"),
		summary: "Render a Mermaid diagram onto the canvas (needs a browser tab)",
		usage:
			"mermaid [diagram.mmd|-] (or stdin)  (converts in the pane holding --board, so there is no --pane to pass; refused, converting nothing, when no pane is holding it)",
	},
	snapshot: {
		owner: legacy(
			snapshotCommands.snapshot,
			"src/cli/commands/snapshot.ts",
			"legacy subcommand dispatch",
		),
		children: {
			save: child(
				legacy(
					snapshotCommands.snapshotSave,
					"src/cli/commands/snapshot.ts",
					"legacy args.ts",
					"route-tail",
				),
			),
			list: child(
				legacy(
					snapshotCommands.snapshotList,
					"src/cli/commands/snapshot.ts",
					"legacy args.ts",
					"route-tail",
				),
			),
			restore: child(
				legacy(
					snapshotCommands.snapshotRestore,
					"src/cli/commands/snapshot.ts",
					"legacy args.ts",
					"route-tail",
				),
			),
		},
		childDiscovery: {
			kind: "first-positional",
			options: childDiscoveryOptions(snapshotCommands.SNAPSHOT_FLAG_SPEC),
		},
		bare: {
			kind: "namespace-refusal",
			message: "Usage: snapshot save|list|restore [name]",
		},
		summary: "Save / list / restore named canvas snapshots",
		usage:
			"snapshot save|list|restore [name] [--force]  (a snapshot belongs to the board it was taken on; --force restores it onto a different one)",
	},
	library: {
		owner: legacy(
			libraryCommands.library,
			"src/cli/commands/library.ts",
			"legacy subcommand dispatch",
		),
		children: {
			list: child(
				legacy(
					libraryCommands.libraryList,
					"src/cli/commands/library.ts",
					"legacy args.ts",
					"route-tail",
				),
			),
			insert: child(
				legacy(
					libraryCommands.libraryInsert,
					"src/cli/commands/library.ts",
					"legacy args.ts",
					"route-tail",
				),
			),
		},
		bare: { kind: "default", child: "list", withLeadingOptions: true },
		summary: "What stencils are in the library, and dropping one onto the board",
		usage:
			"library list [--text] | library insert <name> --x <x> --y <y> [--source <file>] [--id <libraryItemId>]  (the palette lives on the canvas server, not in a browser profile, which is why an agent can read and place from it without a browser)",
	},
	arrange: {
		owner: legacy(
			arrangeCommands.arrange,
			"src/cli/commands/arrange.ts",
			"legacy subcommand dispatch",
		),
		children: {
			align: child(
				legacy(
					arrangeCommands.arrangeAlign,
					"src/cli/commands/arrange.ts",
					"legacy args.ts",
					"route-tail",
				),
			),
			distribute: child(
				legacy(
					arrangeCommands.arrangeDistribute,
					"src/cli/commands/arrange.ts",
					"legacy args.ts",
					"route-tail",
				),
			),
			group: child(
				legacy(
					arrangeCommands.arrangeGroup,
					"src/cli/commands/arrange.ts",
					"legacy args.ts",
					"route-tail",
				),
			),
			ungroup: child(
				legacy(
					arrangeCommands.arrangeUngroup,
					"src/cli/commands/arrange.ts",
					"legacy args.ts",
					"route-tail",
				),
			),
			lock: child(
				legacy(
					arrangeCommands.arrangeLock,
					"src/cli/commands/arrange.ts",
					"legacy args.ts",
					"route-tail",
				),
			),
			unlock: child(
				legacy(
					arrangeCommands.arrangeUnlock,
					"src/cli/commands/arrange.ts",
					"legacy args.ts",
					"route-tail",
				),
			),
			duplicate: child(
				legacy(
					arrangeCommands.arrangeDuplicate,
					"src/cli/commands/arrange.ts",
					"legacy args.ts",
					"route-tail",
				),
			),
		},
		childDiscovery: {
			kind: "first-positional",
			options: childDiscoveryOptions(arrangeCommands.ARRANGE_FLAG_SPEC),
		},
		bare: {
			kind: "namespace-refusal",
			message: "Usage: arrange align|distribute|group|ungroup|lock|unlock|duplicate ...",
		},
		summary: "Align, distribute, group, lock, duplicate elements",
		usage:
			"arrange align|distribute|group|ungroup|lock|unlock|duplicate --ids a,b,c [--to left|horizontal|...]",
	},
	share: {
		owner: legacy(scene.share, "src/cli/commands/scene.ts"),
		summary: "Export to a shareable excalidraw.com URL",
		usage: "share",
	},
	clear: {
		owner: contract(scene.clearContract, "src/cli/commands/scene.ts"),
		summary: "Clear the whole canvas",
		usage: "clear --yes",
	},
	"install-skill": {
		owner: contract(installSkillContract, "src/cli/commands/install-skill.ts"),
		summary: "Install the bundled agent skill and write the setup into this repo",
		usage: [
			"install-skill [--agent codex|claude-code] [--target claude] [--dir <skills-root>]",
			"              [--print-source]",
			"              [--repo <dir>] [--vault <path>] [--doc <file>] [--no-doc] [--yes]",
			"",
			"  Copies the skill into a skills root, then writes the setup into the repo's own CLAUDE.md",
			"  or AGENTS.md — an existing CLAUDE.md first, else an existing AGENTS.md, else AGENTS.md by",
			"  default or CLAUDE.md for the Claude destination. The other one is never created. The block",
			"  is fenced by markers and replaced in place on a re-run, so re-installing does not leave two",
			"  of them.",
			"",
			"  With no destination flag, installs to ~/.agents/skills. For skills.sh-compatible agent",
			"  selection, --agent codex uses that root and --agent claude-code uses ~/.claude/skills.",
			"  --target claude is a shortcut for the latter. Custom roots use --dir; --target codex is",
			"  obsolete and refused.",
			"",
			"  The block records what the skill cannot know: the vault path, how to invoke this binary",
			"  when it is not on PATH, and a section for which boards cover this repo, left for a human",
			"  to fill in. The vault defaults to <repo>/.archboard/vault — boards local to the repo — or",
			"  to ARCHBOARD_VAULT when it is already set; on a terminal you are asked, with that as the",
			"  offered answer. --vault names one outright, --yes takes the offer without asking, and",
			"  --no-doc installs the skill and touches nothing else.",
		].join("\n"),
	},
};

/**
 * Every way the CLI can be invoked, as `{ name, subcommands }` — the command
 * table read as data for contract and documentation checks.
 */
export function cliSurface(): { name: string; subcommands: readonly string[] }[] {
	return Object.entries(COMMANDS).map(([name, route]) => ({
		name,
		subcommands: Object.keys(route.children ?? {}),
	}));
}

/** The one registry projected as all 57 canonical paths during mixed migration. */
export interface CliRegistryEntry {
	name: string;
	parent: string | null;
	kind: "contract" | "legacy";
	handlerOwner: string;
	parserOwner: string;
	handlerName?: string;
	bare?: CommandRoute["bare"];
	childDiscovery?: CommandRoute["childDiscovery"];
	legacyArgv?: LegacyCommand["legacyArgv"];
	handler?: LegacyCommand["handler"];
	contract?: AnyCommandContract;
}

function parserOwner(owner: RouteOwner): string {
	if (owner.kind === "legacy") return owner.parserOwner;
	return owner.contract.parameters.some((parameter) => parameter.route === "staged-tokens")
		? "CommandContract staged token parser"
		: "CommandContract concrete Commander parser";
}

function flattenRoute(
	name: string,
	route: CommandRoute,
	parent: string | null,
): CliRegistryEntry[] {
	const current: CliRegistryEntry = {
		name,
		parent,
		kind: route.owner.kind,
		handlerOwner: route.owner.handlerOwner,
		parserOwner: parserOwner(route.owner),
		...(route.owner.kind === "legacy" ? { handlerName: route.owner.handler.name } : {}),
		...(route.bare ? { bare: route.bare } : {}),
		...(route.childDiscovery ? { childDiscovery: route.childDiscovery } : {}),
		...(route.owner.kind === "contract"
			? { contract: route.owner.contract }
			: { handler: route.owner.handler, legacyArgv: route.owner.legacyArgv }),
	};
	return [
		current,
		...Object.entries(route.children ?? {}).flatMap(([segment, nested]) =>
			flattenRoute(`${name} ${segment}`, nested, name),
		),
	];
}

export function cliContractRegistry(): CliRegistryEntry[] {
	return Object.entries(COMMANDS).flatMap(([name, route]) => flattenRoute(name, route, null));
}

function dispatchedCommand(
	name: string,
	rest: readonly string[],
): {
	root: CommandRoute;
	selected: RouteOwner;
	argv: string[];
} | null {
	const root = COMMANDS[name];
	if (!root) return null;
	let selectedRoute = root;
	let childIndex: number | undefined;
	const direct = rest[0] ? root.children?.[rest[0]] : undefined;
	if (direct) {
		selectedRoute = direct;
		childIndex = 0;
	} else if (root.childDiscovery?.kind === "first-positional") {
		for (let index = 0; index < rest.length; index += 1) {
			const token = rest[index]!;
			if (!token.startsWith("--")) {
				const discovered = root.children?.[token];
				if (discovered) {
					selectedRoute = discovered;
					childIndex = index;
				}
				break;
			}
			const [spelling, inlineValue] = token.slice(2).split("=", 2);
			const option = root.childDiscovery.options[spelling!];
			if (!option) break;
			if (option === "value" && inlineValue === undefined) index += 1;
		}
	}
	if (childIndex === undefined && !root.childDiscovery && root.bare?.kind === "namespace-refusal") {
		throw new CliUsageError(root.bare.message);
	}
	if (
		childIndex === undefined &&
		root.bare?.kind === "default" &&
		(rest.length === 0 || (root.bare.withLeadingOptions && rest[0]?.startsWith("--")))
	) {
		selectedRoute = root.children?.[root.bare.child] ?? root;
	}
	const selected = selectedRoute.owner;
	const argv =
		selected.kind === "contract" || selected.legacyArgv === "route-tail"
			? rest.filter((_, index) => index !== childIndex)
			: [...rest];
	return { root, selected, argv };
}

function printHelp(): void {
	const lines = [
		`archboard ${packageVersion()} — Excalidraw architecture canvas for AI coding agents`,
		"",
		"Usage:",
		"  archboard                  Show this help",
		"  archboard <command> [...]  Drive the canvas from the command line",
		"",
		"  Inside the archboard checkout, `./bin/canvas <command>` runs the CLI from",
		"  src/ with bun, from any cwd. There is no build step, and the package is",
		"  private — there is nothing to install from npm.",
		"",
		"Commands:",
		...Object.entries(COMMANDS).map(
			([name, command]) => `  ${name.padEnd(14)} ${commandSummary(command)}`,
		),
		"",
		"Conventions:",
		"  Results are JSON on stdout — except `describe` (plain text), `selection --text`,",
		"  and raw-content output when --out is omitted (`export` scene JSON,",
		"  `screenshot --format svg`).",
		"  Diagnostics go to stderr.",
		"  --board <key> is global and REQUIRED on every command that touches a board. There is no",
		'    default: a pane holds its own board, so "the board" would be a guess (ADR 0009). A call',
		"    without it is refused, and the refusal lists the boards that are open.",
		'  --doing "..." is global and REQUIRED on every command that CHANGES a board. One short line',
		'    in the present tense — "adding the payment queue" — which goes up on the canvas as the',
		"    write lands, so the person at the board can see what you are up to. A write without it is",
		"    refused. It is never written to the note. A claim's --reason is the overall reason; this is the",
		"    step, and neither stands in for the other.",
		"  --expect-version <n> is global: the version of the board you were working from, from the",
		"    fingerprint on your last write or from `board info`. The write is refused if the board has",
		"    moved past it, naming both versions. You need it only where the canvas cannot know who you",
		"    are — a CLI process with no claim. Under a claim it fills the version in for you.",
		"  Exit codes: 0 ok, 1 error, 2 usage, 3 canvas unreachable, 4 browser tab required,",
		"               5 board write refused (held, claim revoked, version moved, or the",
		"               note changed on disk).",
		"  Canvas-driving commands auto-start the server (disable with EXCALIDRAW_NO_AUTOSTART=1).",
		"  Canvas URL comes from EXPRESS_SERVER_URL (default http://127.0.0.1:3000) or --url.",
		"",
		"Run `archboard help <command>` for per-command usage.",
	];
	process.stdout.write(lines.join("\n") + "\n");
}

function exitCodeFor(error: unknown, command?: RouteOwner): number {
	if (error instanceof CliUsageError) return 2;
	const code = (error as Error & { code?: string }).code;
	if (command?.kind === "contract" && code !== undefined) {
		const declared = command.contract.refusals.find((refusal) => refusal.code === code);
		if (declared) return declared.exit;
	}
	if (code === "CANVAS_UNREACHABLE") return 3;
	if (code === "BROWSER_REQUIRED") return 4;
	// Every refusal leaves the board unwritten, so they share the exit status a
	// script already watches for. The attached body says whether another holder,
	// a revoked claim, a moved version or a changed note stopped it.
	if (code === "BOARD_CONFLICT" || (code !== undefined && BOARD_REFUSAL_CODES.has(code))) return 5;
	// A missing board is a mistake at the keyboard, like any other usage error.
	if (code === "BOARD_REQUIRED") return 2;
	return 1;
}

/**
 * Pull `--board <key>` out of the arguments before the command sees it.
 *
 * Global, like `--url`, because it applies to every canvas request a command
 * makes rather than to one of them — and it is the only way to name a board,
 * because there is no default (ADR 0009). Stripped here so no command has to
 * declare it and none can forget to pass it on.
 */
function takeBoardFlag(argv: string[]): string | null {
	return takeGlobalFlag(argv, "board");
}

/**
 * And `--doing "..."`, for the same reason (TASK-095).
 *
 * Global because a command may make several requests and each of them is the
 * same act: `import` clears the board and then batches the scene in, and both
 * are "restoring the payment path from the export". Stripped before the
 * command's own parser sees it, so no command declares it and none can be the
 * one that dropped it.
 *
 * Not refused here. The canvas knows which routes are board writes and it is
 * the only side that should; a second list on this side would be a second
 * answer to the same question, and the two would drift.
 */
function takeDoingFlag(argv: string[]): string | null {
	return takeGlobalFlag(argv, "doing");
}

/**
 * And `--expect-version <n>`, which says what the writer was editing (TASK-091).
 *
 * Global for the same reason: a command that makes several requests is making
 * them about one board, so the expectation belongs to the invocation rather
 * than to whichever request happens to be the write.
 *
 * A number here and refused if it is not, because a mistyped precondition that
 * was quietly dropped would leave the writer believing it had one.
 */
function takeExpectVersionFlag(argv: string[]): number | null {
	const raw = takeGlobalFlag(argv, "expect-version");
	if (raw === null) return null;
	if (!/^\d+$/.test(raw.trim())) {
		throw new CliUsageError(
			`--expect-version takes a whole number — the version your last write reported, or the one ` +
				`\`board info\` says. Got ${JSON.stringify(raw)}.`,
		);
	}
	return Number(raw.trim());
}

function takeGlobalFlag(argv: string[], name: string): string | null {
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i]!;
		if (token === `--${name}`) {
			const value = argv[i + 1];
			if (value === undefined) throw new CliUsageError(`Flag --${name} requires a value`);
			argv.splice(i, 2);
			return value;
		}
		if (token.startsWith(`--${name}=`)) {
			argv.splice(i, 1);
			return token.slice(name.length + 3);
		}
	}
	return null;
}

export async function runCli(argv: string[]): Promise<void> {
	const [name, ...rest] = argv;

	if (!name || name === "help" || name === "--help" || name === "-h") {
		const topic = name === "help" ? rest[0] : undefined;
		if (topic && COMMANDS[topic]) {
			const command = COMMANDS[topic];
			process.stdout.write(
				`Usage: archboard ${commandUsage(command)}\n  ${commandSummary(command)}\n`,
			);
		} else {
			printHelp();
		}
		return;
	}

	if (name === "--version" || name === "-v" || name === "version") {
		process.stdout.write(packageVersion() + "\n");
		return;
	}

	const command = COMMANDS[name];
	if (!command) {
		process.stderr.write(`Unknown command "${name}". Run \`archboard help\` for the list.\n`);
		process.exitCode = 2;
		return;
	}
	let selected: RouteOwner = command.owner;

	try {
		setRequestedBoard(takeBoardFlag(rest));
		setWriteDoing(takeDoingFlag(rest));
		setExpectedVersion(takeExpectVersionFlag(rest));
		const dispatched = dispatchedCommand(name, rest)!;
		selected = dispatched.selected;
		const commandArgv = dispatched.argv;
		if (selected.kind === "contract") await runCommand(selected.contract, commandArgv);
		else await selected.handler(commandArgv);
	} catch (error) {
		if (!(error as Error & { quiet?: boolean }).quiet) {
			process.stderr.write(`Error: ${formatBoardRefusal(error) ?? (error as Error).message}\n`);
		}
		// A refused write does not stop the board being drawn on, it stops the
		// board being saved (ADR 0006, TASK-079). The refusal above has already
		// listed the three outcomes, so this says only the part it does not: what
		// happens to everything drawn between now and the choice.
		const held = boardHoldSeen();
		const errorCode = (error as Error & { code?: string }).code;
		const contractRefusal =
			errorCode === "BOARD_CONFLICT" ||
			(errorCode !== undefined && BOARD_REFUSAL_CODES.has(errorCode));
		if (held && (selected.kind !== "contract" || contractRefusal)) {
			process.stderr.write(
				`"${held.board}" has stopped saving. Changes from here are held on the canvas ` +
					"and reach no note until one of those three is run.\n",
			);
		}
		if (error instanceof CliUsageError) {
			process.stderr.write(`Usage: archboard ${commandUsage(command)}\n`);
		}
		process.exitCode = exitCodeFor(error, selected);
	}
}
