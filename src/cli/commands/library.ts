import { parseArgs, CliUsageError } from '../args.js';
import { printJson } from '../util.js';
import { ensureCanvasRunning } from '../../core/spawn.js';
import { getLibrary, batchCreateElementsStrict } from '../../core/canvas-client.js';
import { prepareElement } from '../../core/normalize.js';
import { LIBRARY_NAME_OVERLAY } from '../../core/library-names.js';

// What is in the stencil palette, and — since TASK-025 — a way to drop one
// onto the board.
//
// `list` stays read-only: the library itself is edited in the browser, where
// the shapes are visible. This exists because the palette lives on the
// server rather than in a browser profile (ADR 0007), which means an agent
// can be told what is available to drag onto a board instead of guessing.
//
// `insert` is the other half: a library item is just a list of Excalidraw
// elements, so placing one on the board is a translate + fresh-id copy
// through the same create path `add` already uses — no frontend work needed.

function resolvedName(item: { id: string; name?: string | null }): string | null {
  return item.name ?? LIBRARY_NAME_OVERLAY[item.id] ?? null;
}

export async function library(argv: string[]): Promise<void> {
  // The action is always the first bare token; parsing flags happens inside
  // each subcommand so each gets its own spec and unknown flags are caught
  // against the right one.
  const action = argv[0]?.startsWith('--') ? undefined : argv[0];
  const rest = action === undefined ? argv : argv.slice(1);

  if (action === 'insert') return libraryInsert(rest);
  if (action === undefined || action === 'list') return libraryList(rest);

  throw new CliUsageError('Usage: library list [--text] | library insert <name> --x <x> --y <y> [--source <file>] [--id <libraryItemId>]');
}

async function libraryList(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv, { text: { takesValue: false } });

  await ensureCanvasRunning();
  const result = await getLibrary();

  if (!flags.text) {
    printJson({
      count: result.items.length,
      seeded: result.seeded,
      file: result.file,
      vaultBacked: result.vaultBacked,
      // Elements are the bulk of a library and say nothing an agent can use to
      // pick a stencil, so the listing carries what identifies one.
      items: result.items.map(item => ({
        id: item.id,
        name: resolvedName(item),
        // Which curated set it was seeded from, when it was seeded rather than
        // installed. The v1 library format carries no names, so for most of
        // the shipped stencils the overlay (src/core/library-names.ts) is the
        // only thing that identifies them — see that file for how each name
        // was derived.
        from: result.origins?.[item.id] ?? null,
        elements: item.elements.length
      }))
    });
    return;
  }

  const lines: string[] = [];
  lines.push(
    result.items.length === 0
      ? 'The library is empty.'
      : `${result.items.length} stencils in the library.`
  );
  lines.push(
    result.vaultBacked
      ? `Stored at ${result.file}.`
      : 'Not stored: no vault is configured, so the library lasts as long as this canvas server.'
  );
  if (result.seeded.length > 0) lines.push(`Seeded from: ${result.seeded.join(', ')}.`);
  lines.push('');
  for (const item of result.items) {
    const size = `${item.elements.length} element${item.elements.length === 1 ? '' : 's'}`;
    const from = result.origins?.[item.id] ?? 'installed';
    lines.push(`  ${(resolvedName(item) ?? '—').padEnd(24)} ${size.padEnd(13)} ${from.padEnd(32)} ${item.id}`);
  }
  console.log(lines.join('\n'));
}

// ─── insert ───────────────────────────────────────────────────────────────
//
// A library item's elements are authored at whatever coordinates the artist
// used. Dropping a copy onto the board means: pick a fresh id for every
// element (so a second insert of the same item never collides with the
// first), rewrite every internal reference to an old id (group membership,
// arrow bindings, bound-text/bound-element lists) to match, and shift every
// element by the same offset so the group's own geometry survives untouched
// while its top-left corner lands where the caller asked.

interface RawElement {
  id?: string;
  type?: string;
  x?: number;
  y?: number;
  groupIds?: string[];
  boundElementIds?: string[];
  boundElements?: Array<{ id: string; type: string }>;
  startBinding?: { elementId: string; [k: string]: unknown } | null;
  endBinding?: { elementId: string; [k: string]: unknown } | null;
  containerId?: string | null;
  frameId?: string | null;
  customData?: Record<string, unknown> | null;
  [key: string]: unknown;
}

function freshId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

// The library site still serves items in Excalidraw's pre-split format,
// where what is now "arrow" (a connector, with bindings and arrowheads) was
// still called "draw". Nothing downstream understands that type name.
function normalizeType(type: string | undefined): string {
  return type === 'draw' ? 'arrow' : (type ?? 'rectangle');
}

function remapElements(elements: RawElement[], targetX: number, targetY: number, attribution: Record<string, unknown>): any[] {
  const idMap = new Map<string, string>();
  for (const el of elements) {
    if (typeof el.id === 'string') idMap.set(el.id, freshId());
  }
  const groupMap = new Map<string, string>();
  for (const el of elements) {
    for (const g of el.groupIds ?? []) {
      if (!groupMap.has(g)) groupMap.set(g, freshId());
    }
  }
  const mapId = (id: string | undefined | null) => (id != null && idMap.has(id) ? idMap.get(id)! : id);

  const minX = Math.min(...elements.map(el => el.x ?? 0));
  const minY = Math.min(...elements.map(el => el.y ?? 0));
  const dx = targetX - minX;
  const dy = targetY - minY;

  return elements.map(raw => {
    const el: RawElement = JSON.parse(JSON.stringify(raw));
    el.type = normalizeType(el.type);
    el.id = mapId(el.id) ?? freshId();
    el.x = (el.x ?? 0) + dx;
    el.y = (el.y ?? 0) + dy;
    if (Array.isArray(el.groupIds)) {
      el.groupIds = el.groupIds.map(g => groupMap.get(g) ?? g);
    }
    if (Array.isArray(el.boundElementIds)) {
      el.boundElementIds = el.boundElementIds.map(id => mapId(id) ?? id);
    }
    if (Array.isArray(el.boundElements)) {
      el.boundElements = el.boundElements.map(b => ({ ...b, id: mapId(b.id) ?? b.id }));
    }
    // Keep the raw Excalidraw binding fields remapped (the frontend and a
    // full-scene sync read these), and also set the server's own simplified
    // start/end shape (types.ServerElement) so the create path binds too.
    if (el.startBinding && typeof el.startBinding === 'object') {
      const mapped = mapId(el.startBinding.elementId) ?? el.startBinding.elementId;
      el.startBinding = { ...el.startBinding, elementId: mapped };
      (el as any).start = { id: mapped };
    }
    if (el.endBinding && typeof el.endBinding === 'object') {
      const mapped = mapId(el.endBinding.elementId) ?? el.endBinding.elementId;
      el.endBinding = { ...el.endBinding, elementId: mapped };
      (el as any).end = { id: mapped };
    }
    if (typeof el.containerId === 'string') el.containerId = mapId(el.containerId) ?? el.containerId;
    if (typeof el.frameId === 'string') el.frameId = mapId(el.frameId) ?? el.frameId;
    el.customData = { ...(el.customData ?? {}), ...attribution };
    return el;
  });
}

async function libraryInsert(argv: string[]): Promise<void> {
  const { positionals, flags } = parseArgs(argv, {
    x: { takesValue: true },
    y: { takesValue: true },
    source: { takesValue: true },
    id: { takesValue: true }
  });
  const nameArg = positionals[0];
  const idArg = typeof flags.id === 'string' ? flags.id : undefined;
  if (!nameArg && !idArg) {
    throw new CliUsageError('Usage: library insert <name> --x <x> --y <y> [--source <file>] (or --id <libraryItemId> instead of a name)');
  }
  if (typeof flags.x !== 'string' || typeof flags.y !== 'string') {
    throw new CliUsageError('library insert requires --x <number> --y <number>');
  }
  const targetX = Number(flags.x);
  const targetY = Number(flags.y);
  if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
    throw new CliUsageError('--x and --y must be numbers');
  }
  const sourceFilter = typeof flags.source === 'string' ? flags.source : undefined;

  await ensureCanvasRunning();
  const library = await getLibrary();

  let candidates = library.items.map(item => ({
    item,
    name: resolvedName(item),
    source: library.origins?.[item.id] ?? null
  }));

  if (idArg) {
    candidates = candidates.filter(c => c.item.id === idArg);
  } else {
    const wanted = nameArg!.toLowerCase();
    candidates = candidates.filter(c => c.name?.toLowerCase() === wanted);
    if (sourceFilter) candidates = candidates.filter(c => c.source === sourceFilter);
  }

  if (candidates.length === 0) {
    throw new CliUsageError(
      idArg
        ? `No library item with id "${idArg}".`
        : `No library item named "${nameArg}"${sourceFilter ? ` from "${sourceFilter}"` : ''}. Use "library list" to see what is available.`
    );
  }
  if (candidates.length > 1) {
    const options = candidates.map(c => `${c.name} [${c.source ?? 'installed'}] id=${c.item.id}`).join('; ');
    throw new CliUsageError(
      `"${nameArg}" is ambiguous across sources: ${options}. Disambiguate with --source or --id.`
    );
  }

  const chosen = candidates[0]!;
  const rawElements = chosen.item.elements as RawElement[];
  if (!Array.isArray(rawElements) || rawElements.length === 0) {
    throw new Error(`Library item "${chosen.name}" (${chosen.item.id}) has no elements.`);
  }

  const attribution = {
    library: {
      item: chosen.name,
      itemId: chosen.item.id,
      source: chosen.source
    }
  };
  const elements = remapElements(rawElements, targetX, targetY, attribution);
  const created = await batchCreateElementsStrict(elements.map(el => prepareElement(el)));

  printJson({
    success: true,
    name: chosen.name,
    source: chosen.source,
    id: chosen.item.id,
    at: { x: targetX, y: targetY },
    count: created.length,
    elements: created
  });
}
