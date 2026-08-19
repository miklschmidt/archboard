import { parseArgs, CliUsageError } from '../args.js';
import { printJson } from '../util.js';
import { ensureCanvasRunning } from '../../core/spawn.js';
import {
  getCurrentBoard,
  saveSnapshot,
  listSnapshots,
  getSnapshot,
  clearCanvas,
  batchCreateElementsStrict
} from '../../core/canvas-client.js';

export async function snapshot(argv: string[]): Promise<void> {
  const { positionals, flags } = parseArgs(argv, { force: { takesValue: false } });
  const [action, name] = positionals;

  await ensureCanvasRunning();

  switch (action) {
    case 'save': {
      if (!name) throw new CliUsageError('Usage: snapshot save <name>');
      const result = await saveSnapshot(name);
      printJson({ success: true, name, elements: result.elementCount, createdAt: result.createdAt });
      return;
    }
    case 'list': {
      const result = await listSnapshots();
      printJson(result.snapshots ?? []);
      return;
    }
    case 'restore': {
      if (!name) throw new CliUsageError('Usage: snapshot restore <name>');
      let snap;
      try {
        snap = await getSnapshot(name);
      } catch {
        throw new Error(`Snapshot "${name}" not found`);
      }
      // A snapshot is of one board. Restoring it onto a different one would
      // clear that board and refill it with someone else's elements, which is
      // a data loss no undo covers — so it takes saying so.
      const current = await getCurrentBoard().catch(() => null);
      if (snap.board && current?.board && snap.board !== current.board && !flags.force) {
        throw new Error(
          `Snapshot "${name}" was taken on board "${snap.board}", but the canvas is holding ` +
          `"${current.board}". Restoring would replace "${current.board}" with it. ` +
          `Open "${snap.board}" first, or pass --force.`
        );
      }
      await clearCanvas();
      await batchCreateElementsStrict(snap.elements);
      printJson({ success: true, name, board: current?.board ?? null, restored: snap.elements.length });
      return;
    }
    default:
      throw new CliUsageError('Usage: snapshot save|list|restore [name]');
  }
}
