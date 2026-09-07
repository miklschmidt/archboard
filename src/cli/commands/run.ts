import { exportContract } from "@/cli/command-contract/export";
import { queryContract } from "@/cli/command-contract/query";
import { updateContract, WRITE_ANSWER } from "@/cli/command-contract/update";
import { viewportContract } from "@/cli/command-contract/viewport";
import { statusContract } from "@/cli/command-contract/status";
import { boardSaveContract } from "@/cli/command-contract/board-save";
import { startContract, stopContract } from "@/cli/commands/server";
import { addContract, applyContract, deleteContract, getContract } from "@/cli/commands/elements";
import * as scene from "@/cli/commands/scene";
import { panesContract, selectionContract } from "@/cli/commands/selection";
import { browserContract, paneCloseContract, paneOpenContract } from "@/cli/commands/pane";
import { demoteContract, promoteContract } from "@/cli/commands/promote";
import {
	repoAddContract,
	repoContract,
	repoForgetContract,
	repoListContract,
} from "@/cli/commands/repo";
import {
	SNAPSHOT_FLAG_SPEC,
	snapshotContract,
	snapshotListContract,
	snapshotRestoreContract,
	snapshotSaveContract,
} from "@/cli/commands/snapshot";
import {
	boardContract,
	boardInfoContract,
	boardListContract,
	boardNewContract,
	browserShowContract,
} from "@/cli/commands/board";
import { compareContract } from "@/cli/commands/compare";
import { checkContract } from "@/cli/commands/check";
import { changesContract } from "@/cli/commands/changes";
import { claimContract, releaseContract } from "@/cli/commands/claim";
import {
	ARRANGE_FLAG_SPEC,
	arrangeAlignContract,
	arrangeContract,
	arrangeDistributeContract,
	arrangeDuplicateContract,
	arrangeGroupContract,
	arrangeLockContract,
	arrangeUngroupContract,
	arrangeUnlockContract,
} from "@/cli/commands/arrange";
import { installSkillContract } from "@/cli/commands/install-skill";
import {
	libraryContract,
	libraryInsertContract,
	libraryListContract,
} from "@/cli/commands/library";
import { bridgeContract, bridgeRemoveContract } from "@/cli/commands/bridge";
import { renderFindingsContract } from "@/cli/commands/render-findings";
import { childDiscoveryOptions } from "@/cli/command-contract/route-options";
import {
	type CliRegistryEntry,
	type CommandRoute,
	child,
	cliSurfaceOf,
	contract,
	helpFor,
	registryOf,
	runCliWith,
} from "@/cli/command-routing/index";

// The one command table: every top-level command, its subcommands, and the help wording the
// table owns. Dispatch, registry projection and help rendering live under lib/.
const COMMANDS: Record<string, CommandRoute> = {
	bridge: {
		owner: contract(bridgeContract, "src/cli/commands/bridge.ts"),
		children: {
			remove: child(contract(bridgeRemoveContract, "src/cli/commands/bridge.ts")),
		},
		summary: "Mark or remove a verified connector crossing",
		usage:
			"bridge --over <id> --under <id> --background <#RRGGBB> [--at <x,y>] | bridge remove <bridge-id>",
	},
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
		owner: contract(updateContract, "src/cli/command-contract/update.ts"),
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
		owner: contract(queryContract, "src/cli/command-contract/query.ts"),
	},
	promote: {
		owner: contract(promoteContract, "src/cli/commands/promote.ts"),
		summary: "Declare named elements a node: kind, identity, binding",
		usage: [
			'promote --kind service|queue|datastore|gateway|external --ids a,b,c [--name "Payments"] [--node payments]',
			"        [--path src/payments/service.ts] [--repo host/owner/name] [--branch main] [--commit sha]",
			"        [--variant current] [--level system|service|module] [--each] [--text]",
			"",
			"  Targets are explicit board element ids. Read live ids with `browser selection --pane <spec>`.",
			"",
			"  A BINDING NAMES A REPOSITORY, not a directory (ADR 0011). --path takes an absolute path, or a",
			"  repo-relative path with --repo naming a registered checkout (`repo add`), or a path relative to",
			"  the directory you are standing in. That last one says which repository that turned out to be,",
			"  because it is the one the caller did not name. Naming the repo is what lets one board bind",
			"  nodes in five of them without a single `cd`.",
		].join("\n"),
	},
	browser: {
		owner: contract(browserContract, "src/cli/commands/pane.ts"),
		children: {
			open: child(contract(paneOpenContract, "src/cli/commands/pane.ts")),
			close: child(contract(paneCloseContract, "src/cli/commands/pane.ts")),
			show: child(contract(browserShowContract, "src/cli/commands/board.ts")),
			panes: child(contract(panesContract, "src/cli/commands/selection.ts")),
			selection: child(contract(selectionContract, "src/cli/commands/selection.ts")),
			viewport: child(contract(viewportContract, "src/cli/command-contract/viewport.ts")),
			capture: child(contract(scene.screenshotContract, "src/cli/commands/scene.ts")),
		},
		bare: {
			kind: "namespace-refusal",
			message:
				"browser needs a subcommand: panes, open, close, show, selection, viewport, or capture",
		},
		summary: "Inspect or control the connected browser session",
		usage: [
			"browser panes [--text]",
			"        | open | close <pane> | show <board> --pane <pane>",
			"        | selection --pane <pane> [--text]",
			"        | viewport --pane <pane> <camera options>",
			"        | capture --pane <pane> [--out file] [--format png|svg]",
			"  <pane> accepts left, right, top, bottom, focused, primary, a position, or a pane id.",
			"",
			"  These commands inspect or visibly change a connected browser session. Except for `panes`,",
			"  they require a live pane and exit 4 when none exists. None writes a board note.",
			"  `show`, `selection`, `viewport`, and `capture` require an explicit pane so the visible target",
			"  never depends on focus. Use `render --board <key>` for persisted-board PNG or SVG output.",
		].join("\n"),
	},
	demote: {
		owner: contract(demoteContract, "src/cli/commands/promote.ts"),
		summary: "Turn nodes back into plain elements",
		usage: "demote --ids a,b,c [--text]  (demotes every element of each named node)",
	},
	repo: {
		owner: contract(repoContract, "src/cli/commands/repo.ts"),
		children: {
			list: child(contract(repoListContract, "src/cli/commands/repo.ts")),
			add: child(contract(repoAddContract, "src/cli/commands/repo.ts")),
			forget: child(contract(repoForgetContract, "src/cli/commands/repo.ts")),
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
		owner: contract(boardContract, "src/cli/commands/board.ts"),
		children: {
			list: child(contract(boardListContract, "src/cli/commands/board.ts")),
			info: child(contract(boardInfoContract, "src/cli/commands/board.ts")),
			new: child(contract(boardNewContract, "src/cli/commands/board.ts")),
			save: child(contract(boardSaveContract, "src/cli/command-contract/board-save.ts")),
		},
		bare: {
			kind: "namespace-refusal",
			message: "board needs a subcommand: list, info, new, or save",
		},
		summary: "Create, inspect, save, and list persisted boards",
		usage: [
			"board list [--repo <host/owner/name> | --here] [--text]",
			"        | info | new <name> [--variant v] [--level system|service|module]",
			"        | save --board <key> [--as <name>] [--variant v] [--level l] [--force]",
			"",
			"  A board is one .excalidraw.md note in ARCHBOARD_VAULT. These commands never inspect or",
			"  change panes. Use `browser show <board> --pane <spec>` to change what a person sees.",
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
			"  branch is shown with `browser show`. The level comes across unless --level says otherwise.",
			"",
			"  WRITES ARE CHECKED, NOT LOCKED. Every write goes to the note, and archboard verifies that the",
			"  destination still holds the bytes it last wrote there. If the note changed underneath —",
			"  Obsidian, a sync client, another editor — the write is refused, nothing is written, and a save",
			"  exits 5 naming three ways out: reload the displayed note (`browser show <name> --pane <spec> --reload`), overwrite it",
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
			"  their persisted notes. The result never depends on whether either board is open or on screen.",
		].join("\n"),
	},
	check: {
		owner: contract(checkContract, "src/cli/commands/check.ts"),
	},
	"render-findings": {
		owner: contract(renderFindingsContract, "src/cli/commands/render-findings.ts"),
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
		owner: contract(claimContract, "src/cli/commands/claim.ts"),
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
			"  Panes showing the board are read-only to people while you hold it, and every pane shows",
			"  your reason and latest step. A PERSON CAN RELEASE YOUR CLAIM with one explicit control.",
			"  Your next act is then refused once and says so, and NOTHING IS ROLLED BACK: every write",
			"  you made is in the note. So leave the board sensible after each write. Stop when you are",
			"  told; do not claim it again to finish.",
		].join("\n"),
	},
	release: {
		owner: contract(releaseContract, "src/cli/commands/claim.ts"),
		summary: "Give back a board you claimed",
		usage: [
			"release --board <key>",
			"",
			"  Ends the claim. The board goes back to being taken one write at a time, and everything you",
			"  wrote stays where it is. Releasing a claim that has expired, or that somebody took back, is",
			"  not an error — it answers `released: false`.",
		].join("\n"),
	},
	describe: {
		owner: contract(scene.describeContract, "src/cli/commands/scene.ts"),
		summary: "AI-readable scene description (plain text)",
		usage: "describe",
	},
	render: {
		owner: contract(scene.renderContract, "src/cli/commands/scene.ts"),
	},
	export: {
		owner: contract(exportContract, "src/cli/command-contract/export.ts"),
	},
	import: {
		owner: contract(scene.importContract, "src/cli/commands/scene.ts"),
		summary: "Import a .excalidraw or Obsidian .excalidraw.md file (merge by default)",
		usage: "import [scene.excalidraw|note.excalidraw.md|-] [--replace] (or stdin)",
	},
	mermaid: {
		owner: contract(scene.mermaidContract, "src/cli/commands/scene.ts"),
		summary: "Convert Mermaid into one named persisted board",
		usage: "mermaid [diagram.mmd|-] (or stdin)",
	},
	snapshot: {
		owner: contract(snapshotContract, "src/cli/commands/snapshot.ts"),
		children: {
			save: child(contract(snapshotSaveContract, "src/cli/commands/snapshot.ts")),
			list: child(contract(snapshotListContract, "src/cli/commands/snapshot.ts")),
			restore: child(contract(snapshotRestoreContract, "src/cli/commands/snapshot.ts")),
		},
		childDiscovery: {
			kind: "first-positional",
			options: childDiscoveryOptions(SNAPSHOT_FLAG_SPEC),
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
		owner: contract(libraryContract, "src/cli/commands/library.ts"),
		children: {
			list: child(contract(libraryListContract, "src/cli/commands/library.ts")),
			insert: child(contract(libraryInsertContract, "src/cli/commands/library.ts")),
		},
		bare: { kind: "default", child: "list", withLeadingOptions: true },
		summary: "What stencils are in the library, and dropping one onto the board",
		usage:
			"library list [--text] | library insert <name> --x <x> --y <y> [--source <file>] [--id <libraryItemId>]  (the palette lives on the canvas server, not in a browser profile, which is why an agent can read and place from it without a browser)",
	},
	arrange: {
		owner: contract(arrangeContract, "src/cli/commands/arrange.ts"),
		children: {
			align: child(contract(arrangeAlignContract, "src/cli/commands/arrange.ts")),
			distribute: child(contract(arrangeDistributeContract, "src/cli/commands/arrange.ts")),
			group: child(contract(arrangeGroupContract, "src/cli/commands/arrange.ts")),
			ungroup: child(contract(arrangeUngroupContract, "src/cli/commands/arrange.ts")),
			lock: child(contract(arrangeLockContract, "src/cli/commands/arrange.ts")),
			unlock: child(contract(arrangeUnlockContract, "src/cli/commands/arrange.ts")),
			duplicate: child(contract(arrangeDuplicateContract, "src/cli/commands/arrange.ts")),
		},
		childDiscovery: {
			kind: "first-positional",
			options: childDiscoveryOptions(ARRANGE_FLAG_SPEC),
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
		owner: contract(scene.shareContract, "src/cli/commands/scene.ts"),
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
 * Every way the CLI can be invoked, as `{ name, subcommands }`: the command table read as
 * data for contract and documentation checks.
 * @returns One entry per top-level command with its subcommand names.
 */
function cliSurface(): { name: string; subcommands: readonly string[] }[] {
	return cliSurfaceOf(COMMANDS);
}

/**
 * The contract registry: every command and subcommand, classified and architecture-checked.
 * @returns The registry entries in table order.
 */
function cliContractRegistry(): CliRegistryEntry[] {
	return registryOf(COMMANDS);
}

/**
 * Renders one help topic from the same route and contract registry used for dispatch.
 * @param topic - The words after `help`.
 * @returns The help text, or null when the topic names no command.
 */
function commandHelp(topic: readonly string[]): string | null {
	return helpFor(COMMANDS, topic);
}

/**
 * Runs one CLI invocation and sets the process exit code.
 * @param argv - The arguments after the executable name.
 */
async function runCli(argv: string[]): Promise<void> {
	await runCliWith(COMMANDS, argv);
}

export { cliSurface, type CliRegistryEntry, cliContractRegistry, commandHelp, runCli };
