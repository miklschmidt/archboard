import { parseArgs, CliUsageError } from "../args.js";
import { printJson } from "../util.js";
import { ensureCanvasRunning } from "../../core/spawn.js";
import {
	getBoardInfo,
	saveSnapshot,
	listSnapshots,
	getSnapshot,
	clearCanvas,
	batchCreateElementsStrict,
} from "../../core/canvas-client.js";

// Validated up front so a `case` added below without a line here is unreachable.
export const ACTIONS = ["save", "list", "restore"] as const;

export async function snapshot(argv: string[]): Promise<void> {
	const { positionals, flags } = parseArgs(argv, { force: { takesValue: false } });
	const [action, name] = positionals;

	if (!action || !(ACTIONS as readonly string[]).includes(action)) {
		throw new CliUsageError(`Usage: snapshot ${ACTIONS.join("|")} [name]`);
	}

	await ensureCanvasRunning();

	switch (action) {
		case "save": {
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
		case "list": {
			const result = await listSnapshots();
			printJson(result.snapshots ?? []);
			return;
		}
		case "restore": {
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
		default:
			throw new CliUsageError("Usage: snapshot save|list|restore [name]");
	}
}
