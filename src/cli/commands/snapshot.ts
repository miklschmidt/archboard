import { parseArgs, CliUsageError, type FlagSpecs } from "./args.js";
import { printJson } from "./util.js";
import { ensureCanvasRunning } from "../../runtime/engine/spawn.js";
import {
	getBoardInfo,
	saveSnapshot,
	listSnapshots,
	getSnapshot,
	clearCanvas,
	batchCreateElementsStrict,
} from "../../runtime/engine/canvas-client.js";

export const SNAPSHOT_FLAG_SPEC = {
	force: { takesValue: false },
} as const satisfies FlagSpecs;

export async function snapshot(argv: string[]): Promise<void> {
	const { positionals, flags } = parseArgs(argv, SNAPSHOT_FLAG_SPEC);
	const [action, name] = positionals;
	const tail = [...(flags.force ? ["--force"] : []), ...(name ? [name] : [])];

	switch (action) {
		case "save":
			return snapshotSave(tail);
		case "list":
			return snapshotList(tail);
		case "restore":
			return snapshotRestore(tail);
		default:
			throw new CliUsageError("Usage: snapshot save|list|restore [name]");
	}
}

export async function snapshotSave(argv: string[]): Promise<void> {
	const { positionals } = parseArgs(argv, SNAPSHOT_FLAG_SPEC);
	const name = positionals[0];
	await ensureCanvasRunning();
	if (!name) throw new CliUsageError("Usage: snapshot save <name>");
	const result = await saveSnapshot(name);
	printJson({
		success: true,
		name,
		elements: result.elementCount,
		createdAt: result.createdAt,
	});
	return;
}

export async function snapshotList(argv: string[]): Promise<void> {
	parseArgs(argv, SNAPSHOT_FLAG_SPEC);
	await ensureCanvasRunning();
	const result = await listSnapshots();
	printJson(result.snapshots ?? []);
	return;
}

export async function snapshotRestore(argv: string[]): Promise<void> {
	const { positionals, flags } = parseArgs(argv, SNAPSHOT_FLAG_SPEC);
	const name = positionals[0];
	await ensureCanvasRunning();
	if (!name) throw new CliUsageError("Usage: snapshot restore <name>");
	let snap;
	try {
		snap = await getSnapshot(name);
	} catch {
		throw new Error(`Snapshot "${name}" not found`);
	}
	// A snapshot is of one board. Restoring it onto a different one would
	// clear that board and refill it with someone else's elements, which is
	// a data loss no undo covers — so it takes saying so.
	// The board being restored ONTO is the one named on the command line —
	// there is no current board to infer it from (ADR 0009).
	const current = await getBoardInfo();
	if (snap.board && snap.board !== current.board && !flags.force) {
		throw new Error(
			`Snapshot "${name}" was taken on board "${snap.board}", but you named "${current.board}". ` +
				`Restoring would replace "${current.board}" with it. ` +
				`Pass --board ${snap.board} to put it back where it came from, or --force to overwrite this one.`,
		);
	}
	await clearCanvas();
	await batchCreateElementsStrict(snap.elements);
	printJson({ success: true, name, board: current.board, restored: snap.elements.length });
	return;
}
