import { parseArgs, CliUsageError } from "./args.js";
import { printJson, note } from "./util.js";
import { ensureCanvasRunning } from "../../runtime/engine/spawn.js";
import { repoIdentityAt, repoRootOf } from "../../runtime/engine/git.js";
import {
	listBoardsOnCanvas,
	getBoardInfo,
	openBoard,
	newBoard,
	saveBoard,
	boardConflictOf,
} from "../../runtime/engine/canvas-client.js";
import { MAX_PANES } from "../../runtime/engine/panes.js";

export const SUBCOMMANDS = ["list", "info", "new", "open", "save"] as const;

/**
 * The repository the caller is standing in, as an identity.
 *
 * This is a read, not a write: asking which boards describe where you are is
 * exactly a question about here. The identity is still resolved in this
 * process, where the working directory belongs to the caller, and printed back,
 * so nothing downstream has to guess (ADR 0011).
 */
function repoIdentityHere(): string {
	const root = repoRootOf(process.cwd());
	if (!root) {
		throw new CliUsageError(
			`${process.cwd()} is not inside a git repository, so there is no repository to look for. ` +
				"Name one with --repo <host/owner/name>, or drop the filter to list every board.",
		);
	}
	return repoIdentityAt(root);
}

/** The listing as prose: what an agent arriving in a repo reads. */
function boardListText(result: Awaited<ReturnType<typeof listBoardsOnCanvas>>): string {
	if (result.repo) {
		if (result.boards.length === 0) {
			return (
				`No board in ${result.vault} has a node bound to ${result.repo} ` +
				`(${result.scanned ?? 0} board(s) read).`
			);
		}
		const lines = [`Boards describing ${result.repo}:`];
		for (const entry of result.boards) {
			const level = entry.identity?.level ? `, ${entry.identity.level}` : "";
			lines.push(
				`  ${entry.key} (${entry.identity?.variant ?? "current"}${level}, ${entry.source ?? "vault"})`,
			);
			for (const node of entry.nodes ?? []) {
				lines.push(
					`    ${node.name ?? node.node}${node.kind ? ` [${node.kind}]` : ""} -> ${node.path}`,
				);
			}
		}
		lines.push(`Open one with \`board open ${result.boards[0]!.key}\`.`);
		return lines.join("\n");
	}
	if (result.boards.length === 0) return `No boards in ${result.vault} yet.`;
	return [`Boards in ${result.vault}:`, ...result.boards.map((entry) => `  ${entry.key}`)].join(
		"\n",
	);
}

// Boards are addressed as `name` or `name@variant` — `current` is the variant
// that owns the bare name, because it is the architecture that exists.
const ADDRESS_FLAGS = {
	variant: { takesValue: true },
	level: { takesValue: true },
};

// Which pane to show the board in. Required once more than one pane is open:
// putting a board on the half of the screen nobody asked for is a guess, and
// the canvas refuses rather than making it.
const PANE_FLAG = { pane: { takesValue: true } };

const paneSpec = (place: string, index: number): string =>
	place.includes(" ") ? String(index + 1) : place;

/**
 * How a human points at panes: "the left pane", "the left and right panes".
 *
 * The canvas names a solo pane "the only pane", which already reads as a
 * phrase, so it loses the article here rather than coming out as "the the only
 * pane pane".
 */
function listPanes(refs: Array<{ place: string }>): string {
	const places = refs.map((ref) => (ref.place === "the only pane" ? "only" : ref.place));
	const noun = places.length === 1 ? "pane" : "panes";
	if (places.length === 1) return `the ${places[0]} ${noun}`;
	return `the ${places.slice(0, -1).join(", ")} and ${places[places.length - 1]} ${noun}`;
}

/**
 * How to put a branch on screen without losing the board it came from.
 *
 * A branch exists so that the architecture that exists can sit beside the one
 * being proposed (ADR 0012), which is why the save leaves every pane where it
 * was. The command offered here has to keep that true. `pane open` makes a
 * pane and cannot target an existing one, so it can never take a board off the
 * screen; `board open` replaces whatever the pane it names is holding, and
 * with one pane on screen that is the source itself. So this offered
 * `board open` for years and told the caller to undo the save's whole point
 * with a separate command (TASK-054).
 *
 * `board open` is right once the screen is full, because then there is no
 * other way up. It says which board each pane would lose, so the choice is
 * made with the cost in view.
 */
function howToShowBranch(
	branch: string,
	onScreen: Array<{ place: string; board: string }>,
): string {
	if (onScreen.length === 0) {
		return (
			"No pane is open, so nothing is showing either board. Open the canvas in a browser, " +
			`then \`pane open --board ${branch}\`.`
		);
	}
	if (onScreen.length < MAX_PANES) {
		return (
			`Put it beside ${onScreen.length === 1 ? "that one" : "those"} with ` +
			`\`pane open --board ${branch}\`, which makes a pane rather than taking one.`
		);
	}
	// Overlapping tabs are placed "tab 1 of 2", which is a description rather
	// than something to type, so those are pointed at by position instead.
	const cost = onScreen
		.map(
			(pane, index) =>
				`\`board open ${branch} --pane ${paneSpec(pane.place, index)}\` replaces "${pane.board}"`,
		)
		.join(", ");
	return `The screen is full, so putting it up takes a board off: ${cost}.`;
}

export async function board(argv: string[]): Promise<void> {
	const sub = argv[0];
	if (!sub || !(SUBCOMMANDS as readonly string[]).includes(sub)) {
		throw new CliUsageError(`board needs a subcommand: ${SUBCOMMANDS.join(", ")}`);
	}
	const rest = argv.slice(1);

	await ensureCanvasRunning();

	if (sub === "list") {
		const { flags } = parseArgs(rest, {
			repo: { takesValue: true },
			here: { takesValue: false },
			text: { takesValue: false },
		});

		// Which repository, if the question is "what describes this code" rather
		// than "what boards are there". --here reads the working directory, which
		// on a command line is the caller's own; the identity it found is echoed,
		// and the server is only ever given an identity (ADR 0011).
		let repo: string | undefined;
		if (flags.here) {
			if (typeof flags.repo === "string")
				throw new CliUsageError("--here and --repo say the same thing twice; pick one.");
			repo = repoIdentityHere();
			note(`Standing in ${repo}.`);
		} else if (typeof flags.repo === "string") {
			repo = flags.repo;
		}

		const result = await listBoardsOnCanvas(repo);
		// A canvas server older than this CLI ignores ?repo= and answers with every
		// board. Silently handing that back as "the boards describing your repo"
		// would be a wrong answer wearing a right answer's clothes.
		if (repo && !result.repo) {
			throw new Error(
				"The canvas server is older than this CLI and ignored the repository filter, so this would " +
					"have listed every board as though each described " +
					repo +
					". Restart it (`canvas stop` " +
					"then `canvas start`) and try again.",
			);
		}

		// Two notes at one address. Only one of them can be opened, so this is
		// said out loud rather than left in the JSON (ADR 0010).
		const collisions = (result.boards ?? []).filter((entry) => entry.collidesWith?.length);
		const reported = new Set<string>();
		for (const entry of collisions) {
			if (reported.has(entry.key)) continue;
			reported.add(entry.key);
			note(
				`"${entry.key}" is the address of ${(entry.collidesWith?.length ?? 0) + 1} notes that differ only in ` +
					`casing or accents: ${[entry.file, ...(entry.collidesWith ?? [])].join(", ")}. ` +
					`Board names are case-insensitive, so only ${entry.file} is reachable. Rename or delete the others.`,
			);
		}

		if (flags.text) {
			process.stdout.write(boardListText(result) + "\n");
			return;
		}
		printJson({
			success: true,
			vault: result.vault,
			...(result.repo ? { repo: result.repo, scanned: result.scanned } : {}),
			...(result.unreadable ? { unreadable: result.unreadable } : {}),
			boards: result.boards,
			open: result.open,
			onScreen: result.onScreen,
		});
		return;
	}

	if (sub === "info") {
		parseArgs(rest, {});
		const result = await getBoardInfo();
		printJson(result);
		return;
	}

	if (sub === "new") {
		const { positionals, flags } = parseArgs(rest, { ...ADDRESS_FLAGS, ...PANE_FLAG });
		const name = positionals[0];
		if (!name) throw new CliUsageError("board new needs a name");
		const result = await newBoard({
			board: name,
			...(flags.variant ? { variant: flags.variant as string } : {}),
			...(flags.level ? { level: flags.level as string } : {}),
			...(flags.pane ? { pane: flags.pane as string } : {}),
		});
		note(
			`Board "${result.board}" is empty. Its note is written the moment something is drawn on it.` +
				(result.pane ? ` It is on screen in ${listPanes([result.pane])}.` : ""),
		);
		printJson(result);
		return;
	}

	if (sub === "open") {
		const { positionals, flags } = parseArgs(rest, {
			...ADDRESS_FLAGS,
			...PANE_FLAG,
			reload: { takesValue: false },
		});
		const name = positionals[0];
		if (!name) throw new CliUsageError("board open needs a board name");
		const result = await openBoard({
			board: name,
			...(flags.variant ? { variant: flags.variant as string } : {}),
			...(flags.level ? { level: flags.level as string } : {}),
			...(flags.reload ? { reload: true } : {}),
			...(flags.pane ? { pane: flags.pane as string } : {}),
		});
		// Where it landed, said out loud: opening a board shows it somewhere, and
		// which pane that is is the one thing the caller cannot see from here.
		note(
			result.pane
				? `"${result.board}" is showing in ${listPanes([result.pane])}. ` +
						`Commands still name it: \`--board ${result.board}\`.`
				: `"${result.board}" is loaded, but no pane is open, so nothing is showing it.`,
		);
		if (result.source === "memory") {
			note(
				`"${result.board}" was already open here, so this only pointed a pane at it. ` +
					"Pass --reload to re-read its address off disk, which is also what un-sticks a board " +
					"after a write was refused.",
			);
		}
		if (result.declaredKey) {
			note(
				`Note: this file's frontmatter says it is board "${result.declaredKey}", not "${result.board}". ` +
					"The path is the address, so it opened as the path says; saving rewrites the frontmatter to match.",
			);
		}
		printJson(result);
		return;
	}

	// save
	const { flags } = parseArgs(rest, {
		...ADDRESS_FLAGS,
		as: { takesValue: true },
		force: { takesValue: false },
	});

	let result;
	try {
		result = await saveBoard({
			...(flags.as ? { name: flags.as as string } : {}),
			...(flags.variant ? { variant: flags.variant as string } : {}),
			...(flags.level ? { level: flags.level as string } : {}),
			...(flags.force ? { force: true } : {}),
		});
	} catch (error) {
		const conflict = boardConflictOf(error);
		if (!conflict) throw error;
		// A refused save is an answer, not a crash: the message goes to stderr for
		// the human, the structured conflict to stdout for whatever is scripting
		// this, and the exit code says which of the two happened.
		note(conflict.message);
		printJson({ success: false, conflict });
		const quiet = new Error(conflict.message);
		const failure = quiet as Error & { quiet?: boolean; code?: string };
		failure.quiet = true;
		failure.code = "BOARD_CONFLICT";
		throw quiet;
	}

	// What the save did to the screen. A save writes a file; `board open`
	// chooses what is on show (ADR 0012), so the one case where a save moves a
	// pane and the one where it deliberately does not both get said out loud.
	const moved = result.panes?.moved ?? [];
	const kept = result.panes?.kept ?? [];
	if (moved.length) {
		note(
			`"${result.board}" is now showing in ${listPanes(moved)}, which held the board it was saved from.`,
		);
	} else if (result.saveKind === "branch") {
		note(
			`Branched "${result.savedFrom}" to "${result.board}". ` +
				(kept.length
					? `Nothing moved: ${listPanes(kept)} still ${kept.length > 1 ? "hold" : "holds"} ` +
						`"${result.savedFrom}", and the branch is not showing anywhere. `
					: `No pane was holding "${result.savedFrom}", and the branch is not showing anywhere either. `) +
				howToShowBranch(result.board, result.panes?.onScreen ?? []),
		);
	}

	// One of the two outcomes that end a hold has just been taken, so what this
	// save did is bigger than the file it wrote: the board is being written down
	// again, and the changes that were riding on the choice went somewhere
	// (ADR 0006, TASK-079).
	const ended = result.resolvedHold;
	if (ended) {
		const held = `${ended.writes} change${ended.writes === 1 ? "" : "s"}`;
		note(
			ended.outcome === "overwrite"
				? `"${ended.board}" is saving again, with the ${held} that were held on the canvas. ` +
						`Whatever ${result.file} held before is gone.`
				: `The ${held} that were held are in ${result.file}, and it is what the panes now show. ` +
						`"${ended.board}" is saving again and holds the version the other editor wrote.`,
		);
	}

	if (result.forced) {
		note(`Overwrote ${result.file} on your say-so; whatever that note held is gone.`);
	} else if (result.overwrote) {
		// The convention, stated where it is actionable: the check catches a note
		// that has already changed on disk, and cannot see a copy still sitting in
		// another editor's memory.
		note(
			"Saved after checking the note had not changed on disk. archboard cannot see an unsaved copy " +
				"held in Obsidian, so keep a board open in one editor at a time.",
		);
	}
	printJson(result);
}
