import { parseArgs, CliUsageError } from '../args.js';
import { printJson } from '../util.js';
import { ensureCanvasRunning } from '../../core/spawn.js';
import { getBoardInfo, getElements, getSelection, updateElementStrict } from '../../core/canvas-client.js';
import { ServerElement } from '../../types.js';
import {
  KINDS,
  PromotionError,
  ElementUpdate,
  demotionSummary,
  normalizeKind,
  planDemotion,
  planPromotion,
  promotionSummary,
  resolveBinding,
  validateNodeId
} from '../../core/promote.js';

// promote / demote — the touchscreen gesture, in one command.
//
// The default target is whatever the human has selected on the board, because
// the utterance this serves ("map this to the payments service") names no ids.
// `--ids` exists for scripts and for an agent acting on something it just drew.

async function targetElements(idsFlag: unknown, board: ServerElement[], verb: string): Promise<ServerElement[]> {
  const byId = new Map(board.map(el => [el.id, el]));

  if (typeof idsFlag === 'string') {
    const ids = idsFlag.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) throw new CliUsageError('--ids was empty');
    const missing = ids.filter(id => !byId.has(id));
    if (missing.length > 0) throw new Error(`No element on the canvas with id ${missing.join(', ')}`);
    return ids.map(id => byId.get(id)!);
  }

  const selection = await getSelection();
  if (selection.elementIds.length === 0) {
    throw new PromotionError(
      `Nothing is selected on the board, so there is nothing to ${verb}. ` +
      `Select the shapes on the canvas, or pass --ids a,b,c.`
    );
  }
  const found = selection.elementIds.map(id => byId.get(id)).filter(Boolean) as ServerElement[];
  if (found.length === 0) {
    throw new Error(`The selected ids are not on the canvas any more: ${selection.elementIds.join(', ')}`);
  }
  return found;
}

// customData has to be sent whole (the server merges top-level keys, so an
// omitted customData would be left stale rather than cleared), and the plan
// has already merged it.
async function applyUpdates(updates: ElementUpdate[]): Promise<void> {
  for (const update of updates) {
    await updateElementStrict(update as Partial<ServerElement> & { id: string });
  }
}

export async function promote(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv, {
    ids: { takesValue: true },
    kind: { takesValue: true },
    name: { takesValue: true },
    node: { takesValue: true },
    path: { takesValue: true },
    repo: { takesValue: true },
    branch: { takesValue: true },
    commit: { takesValue: true },
    variant: { takesValue: true },
    level: { takesValue: true },
    each: { takesValue: false },
    text: { takesValue: false }
  });

  if (typeof flags.kind !== 'string') {
    throw new CliUsageError(`--kind is required (one of: ${KINDS.join(', ')})`);
  }
  const kind = normalizeKind(flags.kind);
  const nodeId = typeof flags.node === 'string' ? validateNodeId(flags.node) : undefined;

  await ensureCanvasRunning();
  const board = await getElements();
  const targets = await targetElements(flags.ids, board, 'promote');

  // The shell's own working directory, stated rather than assumed. A command
  // line has one the caller chose and can see, so it is a legitimate way to
  // name a repository — but only when the answer says which repository it
  // turned out to be (ADR 0011), which `resolveBinding` puts in the note.
  const binding = typeof flags.path === 'string'
    ? resolveBinding({
        path: flags.path,
        ...(typeof flags.repo === 'string' ? { repo: flags.repo } : {}),
        ...(typeof flags.branch === 'string' ? { branch: flags.branch } : {}),
        ...(typeof flags.commit === 'string' ? { commit: flags.commit } : {})
      }, { kind: 'cwd', dir: process.cwd() })
    : undefined;
  if (!binding && (flags.repo || flags.branch || flags.commit)) {
    throw new CliUsageError('--repo/--branch/--commit describe a binding; give --path too.');
  }

  // Which variant this board is, asked of the board rather than of the caller.
  // `--board` already named it, so `--variant` is an override and not a thing
  // anyone has to remember on a proposal board (TASK-040).
  const identity = await getBoardInfo();

  const plan = planPromotion({
    targets,
    board,
    kind,
    boardVariant: identity.identity.variant,
    ...(typeof flags.name === 'string' ? { name: flags.name } : {}),
    ...(nodeId ? { nodeId } : {}),
    ...(binding ? { binding } : {}),
    ...(typeof flags.variant === 'string' ? { variant: flags.variant } : {}),
    ...(typeof flags.level === 'string' ? { level: flags.level } : {}),
    ...(flags.each ? { each: true } : {})
  });

  await applyUpdates(plan.updates);

  const summary = promotionSummary(plan, binding?.note);
  if (flags.text) {
    process.stdout.write(summary + '\n');
    return;
  }
  printJson({
    success: true,
    summary,
    nodes: plan.nodes,
    elementsUpdated: plan.updates.length,
    ...(binding ? { binding: { resolvedFrom: binding.resolvedFrom, resolved: binding.resolved } } : {}),
    ...(binding && !binding.resolved ? { bindingResolved: false } : {})
  });
}

export async function demote(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv, {
    ids: { takesValue: true },
    text: { takesValue: false }
  });

  await ensureCanvasRunning();
  const board = await getElements();
  const targets = await targetElements(flags.ids, board, 'demote');

  const plan = planDemotion(targets, board);
  await applyUpdates(plan.updates);

  const summary = demotionSummary(plan);
  if (flags.text) {
    process.stdout.write(summary + '\n');
    return;
  }
  printJson({
    success: true,
    summary,
    nodes: plan.nodes,
    elementsUpdated: plan.updates.length
  });
}
