// The stencil palette, as something an agent can choose from and place.
//
// `src/core/library.ts` is the store: what a browser posts, what a vault holds.
// This is the layer above it — the two questions an agent actually asks, "what
// can I draw with" and "put that one there" — and it lives in core because both
// surfaces ask them. The CLI (`library list` / `library insert`) and MCP
// (`list_library_items` / `insert_library_item`) are two spellings of what is
// below; a client with no shell has no other way to reach the palette at all.
//
// Two things about the palette make this more than a lookup:
//
//   nothing is named   the v1 library format carries no names, so 100 of the
//                      111 shipped stencils are identified only by the overlay
//                      in library-names.ts — and a name alone still does not
//                      tell "Server" from "Device". A catalogue entry therefore
//                      carries size and the words drawn inside the stencil, so
//                      it can be chosen from without being rendered.
//
//   names collide      a name is unique only within the library it came from.
//                      "Database" exists in four. That is the caller's choice
//                      to make, so insertion refuses and names the candidates
//                      rather than picking one.

import { getLibrary, batchCreateElementsStrict } from './canvas-client.js';
import type { ServerElement } from '../types.js';
import { prepareElement } from './normalize.js';
import { LIBRARY_NAME_OVERLAY } from './library-names.js';
import { extentOf } from './geometry.js';

/** One stencil, described well enough to be picked without being drawn. */
export interface CatalogueEntry {
  id: string;
  name: string | null;
  /** The curated set it was seeded from, or null when a human installed it. */
  source: string | null;
  elements: number;
  width: number;
  height: number;
  /** The words drawn inside the stencil, which are often what it really is. */
  text: string | null;
}

export interface Catalogue {
  count: number;
  seeded: string[];
  file: string | null;
  vaultBacked: boolean;
  items: CatalogueEntry[];
}

interface RawElement {
  id?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: unknown;
  groupIds?: string[];
  boundElementIds?: string[];
  boundElements?: Array<{ id: string; type: string }>;
  startBinding?: { elementId: string;[k: string]: unknown } | null;
  endBinding?: { elementId: string;[k: string]: unknown } | null;
  containerId?: string | null;
  frameId?: string | null;
  customData?: Record<string, unknown> | null;
  [key: string]: unknown;
}

interface StoredItem {
  id: string;
  name?: string | null;
  elements: RawElement[];
}

function resolvedName(item: { id: string; name?: string | null }): string | null {
  return item.name ?? LIBRARY_NAME_OVERLAY[item.id] ?? null;
}

// How big the stencil is, measured rather than assumed: a connector inside it
// stores an origin and a path, not a top-left and a size, so a stencil with a
// leftward arrow in it used to be listed at the wrong size (geometry.ts,
// TASK-038).
function boundingBox(elements: RawElement[]): { width: number; height: number } {
  if (elements.length === 0) return { width: 0, height: 0 };
  const boxes = elements.map(extentOf);
  const minX = Math.min(...boxes.map(b => b.x));
  const minY = Math.min(...boxes.map(b => b.y));
  const maxX = Math.max(...boxes.map(b => b.x + b.width));
  const maxY = Math.max(...boxes.map(b => b.y + b.height));
  return { width: Math.round(maxX - minX), height: Math.round(maxY - minY) };
}

const TEXT_BUDGET = 60;

function stencilText(elements: RawElement[]): string | null {
  const words: string[] = [];
  for (const el of elements) {
    if (typeof el.text !== 'string') continue;
    const line = el.text.replace(/\s+/g, ' ').trim();
    if (line && !words.includes(line)) words.push(line);
  }
  if (words.length === 0) return null;
  const joined = words.join(' / ');
  return joined.length > TEXT_BUDGET ? `${joined.slice(0, TEXT_BUDGET - 1)}…` : joined;
}

function entryOf(item: StoredItem, source: string | null): CatalogueEntry {
  const { width, height } = boundingBox(item.elements);
  const name = resolvedName(item);
  const text = stencilText(item.elements);
  return {
    id: item.id,
    name,
    source,
    elements: item.elements.length,
    width,
    height,
    // Most names were read off the stencil's own text in the first place, so
    // the two agree more often than not; repeating it would be noise. This
    // field is here for the ones where they part — a "Key-value cache" that
    // reads "Key / Value / Cache", a decision diamond that says "Condition".
    text: text && text.toLowerCase() !== name?.toLowerCase() ? text : null
  };
}

interface LoadedCatalogue extends Catalogue {
  /** The elements behind each entry, by id. Only insertion needs them. */
  stored: Map<string, StoredItem>;
}

async function loadCatalogue(): Promise<LoadedCatalogue> {
  const state = await getLibrary();
  const items = state.items as unknown as StoredItem[];
  const stored = new Map(items.map(item => [item.id, item]));
  return {
    count: items.length,
    seeded: state.seeded,
    file: state.file,
    vaultBacked: state.vaultBacked,
    // Elements are the bulk of a library and say nothing an agent can use to
    // pick a stencil, so the listing carries what identifies one instead.
    items: items.map(item => entryOf(item, state.origins?.[item.id] ?? null)),
    stored
  };
}

/** What is in the palette. */
export async function readCatalogue(): Promise<Catalogue> {
  const { stored: _stored, ...catalogue } = await loadCatalogue();
  return catalogue;
}

/** The same catalogue as a table, for a human or a narrow context. */
export function catalogueText(catalogue: Catalogue): string {
  const lines: string[] = [];
  lines.push(
    catalogue.count === 0
      ? 'The library is empty.'
      : `${catalogue.count} stencils in the library.`
  );
  lines.push(
    catalogue.vaultBacked
      ? `Stored at ${catalogue.file}.`
      : 'Not stored: no vault is configured, so the library lasts as long as this canvas server.'
  );
  if (catalogue.seeded.length > 0) lines.push(`Seeded from: ${catalogue.seeded.join(', ')}.`);
  lines.push('');
  lines.push('name — size — elements — source library — id, then in quotes what the stencil says, where that is not just its name.');
  lines.push('Insert one by name, adding its source when two libraries use that name.');
  lines.push('');
  const nameColumn = Math.max(4, ...catalogue.items.map(item => (item.name ?? '—').length));
  const sourceColumn = Math.max(9, ...catalogue.items.map(item => (item.source ?? 'installed').length));
  for (const item of catalogue.items) {
    const parts = [
      (item.name ?? '—').padEnd(nameColumn),
      `${item.width}x${item.height}`.padStart(9),
      `${item.elements} el`.padStart(7),
      (item.source ?? 'installed').padEnd(sourceColumn),
      item.id
    ];
    lines.push(`  ${parts.join(' ')}${item.text ? `  "${item.text}"` : ''}`);
  }
  return lines.join('\n');
}

// ─── choosing one ─────────────────────────────────────────────────────────

// Both of these are the caller's question to answer, not ours, so each carries
// what it takes to answer it and neither says how — the phrasing of the retry
// is a surface's own business, since one has flags and the other has fields.

/** A name that more than one library uses. */
export class AmbiguousStencilError extends Error {
  constructor(readonly wanted: string, readonly candidates: CatalogueEntry[]) {
    super(
      `"${wanted}" is a name ${candidates.length} libraries use: ` +
      candidates.map(c => `${c.name} [${c.source ?? 'installed'}] id=${c.id}`).join('; ') + '.'
    );
    this.name = 'AmbiguousStencilError';
  }
}

/** A name or id no stencil has. */
export class UnknownStencilError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownStencilError';
  }
}

export interface StencilQuery {
  name?: string;
  source?: string;
  itemId?: string;
}

/** Which stencil the caller meant, or an error saying why that is not decided. */
export function chooseStencil(items: CatalogueEntry[], query: StencilQuery): CatalogueEntry {
  let candidates = items;

  if (query.itemId) {
    candidates = candidates.filter(entry => entry.id === query.itemId);
    if (candidates.length === 0) {
      throw new UnknownStencilError(`No library item with id "${query.itemId}".`);
    }
    return candidates[0]!;
  }

  const wanted = (query.name ?? '').toLowerCase();
  candidates = candidates.filter(entry => entry.name?.toLowerCase() === wanted);
  if (query.source) candidates = candidates.filter(entry => entry.source === query.source);

  if (candidates.length === 0) {
    throw new UnknownStencilError(
      `No library item named "${query.name}"${query.source ? ` from "${query.source}"` : ''}.`
    );
  }
  if (candidates.length > 1) throw new AmbiguousStencilError(query.name!, candidates);
  return candidates[0]!;
}

// ─── placing one ──────────────────────────────────────────────────────────
//
// A library item's elements are authored at whatever coordinates the artist
// used. Dropping a copy onto the board means: pick a fresh id for every
// element (so a second insert of the same item never collides with the
// first), rewrite every internal reference to an old id (group membership,
// arrow bindings, bound-text/bound-element lists) to match, and shift every
// element by the same offset so the group's own geometry survives untouched
// while its top-left corner lands where the caller asked.

function freshId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

// The library site still serves items in Excalidraw's pre-split format,
// where what is now "arrow" (a connector, with bindings and arrowheads) was
// still called "draw". Nothing downstream understands that type name.
function normalizeType(type: string | undefined): string {
  return type === 'draw' ? 'arrow' : (type ?? 'rectangle');
}

export function remapElements(
  elements: RawElement[],
  targetX: number,
  targetY: number,
  attribution: Record<string, unknown>
): any[] {
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

  // Where the stencil starts, so the drop lands under the pointer. Measured,
  // for the same reason as boundingBox above.
  const boxes = elements.map(extentOf);
  const minX = Math.min(...boxes.map(b => b.x));
  const minY = Math.min(...boxes.map(b => b.y));
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

export interface InsertResult {
  success: true;
  name: string | null;
  source: string | null;
  id: string;
  at: { x: number; y: number };
  count: number;
  elements: ServerElement[];
}

/**
 * Copy a stencil onto the board with its top-left corner at (x, y).
 *
 * Throws `UnknownStencilError` when nothing matches and `AmbiguousStencilError`
 * when a name belongs to more than one library — both are the caller's to
 * answer, so neither is guessed at here.
 */
export async function insertStencil(query: StencilQuery & { x: number; y: number }): Promise<InsertResult> {
  const catalogue = await loadCatalogue();
  const entry = chooseStencil(catalogue.items, query);
  const item = catalogue.stored.get(entry.id)!;

  if (!Array.isArray(item.elements) || item.elements.length === 0) {
    throw new Error(`Library item "${entry.name}" (${entry.id}) has no elements.`);
  }

  // Where a stencil came from, carried on the elements themselves: the only
  // record afterwards that these shapes were a palette item rather than drawn.
  const attribution = {
    library: { item: entry.name, itemId: entry.id, source: entry.source }
  };
  const elements = remapElements(item.elements, query.x, query.y, attribution);
  const created = await batchCreateElementsStrict(elements.map(el => prepareElement(el)));

  return {
    success: true,
    name: entry.name,
    source: entry.source,
    id: entry.id,
    at: { x: query.x, y: query.y },
    count: created.length,
    elements: created
  };
}
