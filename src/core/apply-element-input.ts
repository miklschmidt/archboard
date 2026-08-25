import { z } from 'zod';

import {
  EXCALIDRAW_ELEMENT_TYPES,
  ExcalidrawElementType,
  ServerElement,
  normalizeFontFamily
} from '../types.js';
import { DEFAULT_FILL_STYLE, DEFAULT_SHAPE_BACKGROUND, FILLABLE_TYPES } from './appearance.js';
import { bindingFromRef, bindingOf, boundEndpoint, centreOf } from './arrow-binding.js';
import {
  expandForBoard,
  relabelBoundTexts,
  repairIndices,
  settleDeletions
} from './expand-elements.js';
import {
  DEFAULT_LINEAR_POINTS,
  pointsOf,
  remeasureLinear,
  validateRenderGeometry
} from './geometry.js';
import { copyElements } from './board-store.js';
import { mintId } from './ids.js';
import { recentreBoundTexts } from './labels.js';

export const PointSchema = z.union([
  z.tuple([z.number(), z.number()]),
  z.object({ x: z.number(), y: z.number() })
]);

const BindingSchema = z.object({
  elementId: z.string(),
  focus: z.number().optional(),
  gap: z.number().optional(),
  fixedPoint: z.tuple([z.number(), z.number()]).nullable().optional(),
  mode: z.string().optional()
}).nullable();

const ElementFields = {
  type: z.enum(Object.values(EXCALIDRAW_ELEMENT_TYPES) as [
    ExcalidrawElementType,
    ...ExcalidrawElementType[]
  ]),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  backgroundColor: z.string().optional(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  strokeStyle: z.string().optional(),
  roughness: z.number().optional(),
  opacity: z.number().optional(),
  text: z.string().optional(),
  originalText: z.string().optional(),
  label: z.object({ text: z.string() }).optional(),
  fontSize: z.number().optional(),
  fontFamily: z.union([z.string(), z.number()]).optional(),
  containerId: z.string().nullable().optional(),
  index: z.string().nullable().optional(),
  seed: z.number().optional(),
  versionNonce: z.number().optional(),
  updated: z.number().optional(),
  groupIds: z.array(z.string()).optional(),
  locked: z.boolean().optional(),
  roundness: z.object({ type: z.number(), value: z.number().optional() }).nullable().optional(),
  fillStyle: z.string().optional(),
  points: z.array(PointSchema).optional(),
  start: z.object({ id: z.string() }).nullable().optional(),
  end: z.object({ id: z.string() }).nullable().optional(),
  startElementId: z.string().optional(),
  endElementId: z.string().optional(),
  startArrowhead: z.string().nullable().optional(),
  endArrowhead: z.string().nullable().optional(),
  elbowed: z.boolean().optional(),
  startBinding: BindingSchema.optional(),
  endBinding: BindingSchema.optional(),
  boundElements: z.array(z.object({
    id: z.string(),
    type: z.enum(['arrow', 'text'])
  })).nullable().optional(),
  fileId: z.string().optional(),
  status: z.string().optional(),
  scale: z.tuple([z.number(), z.number()]).optional()
};

export const CreateElementSchema = z.looseObject({
  id: z.string().optional(),
  ...ElementFields
});

export const UpdateElementSchema = z.looseObject({
  id: z.string(),
  ...Object.fromEntries(
    Object.entries(ElementFields).map(([name, schema]) => [name, schema.optional()])
  )
});

export const CREATE_ELEMENT_JSON_SCHEMA = z.toJSONSchema(CreateElementSchema);
export const UPDATE_ELEMENT_JSON_SCHEMA = z.toJSONSchema(UpdateElementSchema);

export interface ElementInputRequest {
  upserts?: Record<string, unknown>[];
  deletes?: string[];
  origin: 'agent' | 'human';
  timestamp?: string;
}

export interface AppliedElementInput {
  /** The board-shape elements corresponding to `upserts`, in input order. */
  named: ServerElement[];
  /** The request-local document before well-forming repairs and settlement. */
  requested: ServerElement[];
  created: ServerElement[];
  updated: ServerElement[];
  deleted: string[];
}

function normalizePoints(points: unknown): unknown {
  if (!Array.isArray(points)) return points;
  const normalized = pointsOf(points);
  return normalized && normalized.length === points.length
    ? normalized.map(point => [point.x, point.y])
    : points;
}

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

function bumpVersion(element: ServerElement, previous?: ServerElement, at = new Date().toISOString()): void {
  element.updatedAt = at;
  element.version = ((previous ?? element).version || 0) + 1;
}

/**
 * The one implementation of making an input-spelling statement well formed.
 * It spends client aliases here so CLI, MCP, library and direct HTTP writes
 * all reach the converter as the same statement.
 */
function wellFormStatement(
  raw: Record<string, unknown>,
  existingType?: string
): Record<string, unknown> {
  const statement = { ...raw };
  if (hasOwn(statement, 'points')) {
    statement.points = normalizePoints(statement.points);
  }

  for (const [alias, ref] of [
    ['startElementId', 'start'],
    ['endElementId', 'end']
  ] as const) {
    if (hasOwn(statement, alias)) {
      const id = statement[alias];
      statement[ref] = typeof id === 'string' && id ? { id } : null;
    }
    delete statement[alias];
  }

  const type = typeof statement.type === 'string' ? statement.type : existingType;
  if (type !== EXCALIDRAW_ELEMENT_TYPES.TEXT &&
      hasOwn(statement, 'text')) {
    const text = statement.text;
    delete statement.text;
    if (typeof text === 'string') statement.label = { text };
  }
  return statement;
}

function applyDefaultFill(element: ServerElement): void {
  if (!FILLABLE_TYPES.has(element.type) || element.backgroundColor !== undefined) return;
  element.backgroundColor = DEFAULT_SHAPE_BACKGROUND;
  if ((element as any).fillStyle === undefined) (element as any).fillStyle = DEFAULT_FILL_STYLE;
}

function spendArrowRefs(element: Record<string, any>, stated: Record<string, any>): void {
  if (element.type !== 'arrow' && element.type !== 'line') return;
  for (const [ref, binding] of [['start', 'startBinding'], ['end', 'endBinding']] as const) {
    const said = hasOwn(stated, ref);
    const value = element[ref];
    delete element[ref];
    if (said) element[binding] = bindingFromRef(value);
  }
}

function wellFormNewElement(
  raw: Record<string, unknown>,
  inUse: { has(id: string): boolean }
): ServerElement {
  const statement = wellFormStatement(raw);
  const params = CreateElementSchema.parse(statement);
  const { board: _boardField, ...elementParams } = params as typeof params & { board?: string };
  const now = new Date().toISOString();
  const element = {
    id: params.id || mintId(inUse),
    ...elementParams,
    fontFamily: normalizeFontFamily(params.fontFamily),
    createdAt: now,
    updatedAt: now,
    version: 1
  } as ServerElement;

  if ((element.type === 'arrow' || element.type === 'line') &&
      ((element as any).start !== undefined || (element as any).end !== undefined) &&
      !Array.isArray(element.points)) {
    (element as any).points = DEFAULT_LINEAR_POINTS.map(point => [...point]);
  }
  applyDefaultFill(element);
  spendArrowRefs(element as Record<string, any>, elementParams as Record<string, any>);
  return element;
}

function normalizeLineBreakMarkup(text: string): string {
  return text
    .replace(/<\s*b\s*r\s*\/?\s*>/gi, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

interface ElementMerge {
  element: ServerElement;
  geometryChanged: boolean;
  reboundArrow: boolean;
}

function mergeElementUpdate(
  existing: ServerElement,
  raw: Record<string, unknown>
): ElementMerge {
  const statement = wellFormStatement(raw, existing.type);
  const { board: _boardField, ...updates } =
    UpdateElementSchema.parse({ ...statement, id: existing.id }) as Record<string, any>;
  const element: ServerElement = {
    ...existing,
    ...updates,
    fontFamily: updates.fontFamily !== undefined
      ? normalizeFontFamily(updates.fontFamily)
      : existing.fontFamily
  };
  bumpVersion(element, existing);

  const hasTextUpdate = hasOwn(statement, 'text');
  const hasOriginalTextUpdate = hasOwn(statement, 'originalText');
  if (element.type === EXCALIDRAW_ELEMENT_TYPES.TEXT && hasTextUpdate && !hasOriginalTextUpdate) {
    const incomingText = updates.text ?? '';
    const existingText = typeof existing.text === 'string' ? existing.text : '';
    const existingOriginalText = typeof existing.originalText === 'string' ? existing.originalText : '';
    const existingOriginalHasBr = /<\s*b\s*r\s*\/?\s*>/i.test(existingOriginalText);
    const normalizedExistingText = normalizeLineBreakMarkup(existingText);
    const normalizedExistingOriginalText = normalizeLineBreakMarkup(existingOriginalText);
    if (existingOriginalHasBr && incomingText === normalizedExistingText && normalizedExistingOriginalText) {
      element.text = normalizedExistingOriginalText;
      element.originalText = normalizedExistingOriginalText;
    } else {
      element.originalText = incomingText;
    }
  }

  spendArrowRefs(element as Record<string, any>, statement as Record<string, any>);
  const changed = (key: string) => hasOwn(statement, key);
  if (changed('points')) sizeFromPath(element);
  const isLinear = element.type === 'arrow' || element.type === 'line';
  return {
    element,
    geometryChanged: ['x', 'y', 'width', 'height', 'points', 'angle'].some(changed),
    reboundArrow: isLinear && ['start', 'end', 'startBinding', 'endBinding'].some(changed)
  };
}

function sizeFromPath(element: ServerElement): boolean {
  const measured = remeasureLinear(element);
  if (!measured) return false;
  element.width = measured.width;
  element.height = measured.height;
  return true;
}

function pathOf(element: ServerElement): { x: number; y: number }[] {
  const measured = pointsOf(element.points);
  const points = measured && measured.length >= 2
    ? measured
    : DEFAULT_LINEAR_POINTS.map(([x, y]) => ({ x, y }));
  return points.map(point => ({ x: element.x + point.x, y: element.y + point.y }));
}

function resolveArrowBindings(
  written: ServerElement[],
  board: Map<string, ServerElement>,
  newlyDrawn = false
): void {
  const available = new Map(board);
  for (const element of written) available.set(element.id, element);

  for (const element of written) {
    if (element.type !== 'arrow' && element.type !== 'line') continue;
    if ((element as any).elbowed === true) continue;
    const startBinding = bindingOf((element as any).startBinding);
    const endBinding = bindingOf((element as any).endBinding);
    const startElement = startBinding ? available.get(startBinding.elementId) : undefined;
    const endElement = endBinding ? available.get(endBinding.elementId) : undefined;
    if (!startElement && !endElement) continue;

    const points = pathOf(element);
    const last = points.length - 1;
    const straight = points.length === 2;
    const startAim = newlyDrawn && straight && endElement ? centreOf(endElement) : points[1]!;
    const endAim = newlyDrawn && straight && startElement ? centreOf(startElement) : points[last - 1]!;
    if (startBinding && startElement) {
      points[0] = boundEndpoint(startElement, startBinding, startAim, points[0]!);
    }
    if (endBinding && endElement) {
      points[last] = boundEndpoint(endElement, endBinding, endAim, points[last]!);
    }
    const origin = points[0]!;
    element.x = origin.x;
    element.y = origin.y;
    element.points = points.map(point => [point.x - origin.x, point.y - origin.y]);
    sizeFromPath(element);
  }
}

function rerouteBoundArrows(
  movedId: string,
  board: Map<string, ServerElement>
): ServerElement[] {
  const rerouted: ServerElement[] = [];
  for (const element of board.values()) {
    if (element.type !== 'arrow' && element.type !== 'line') continue;
    const joins = (binding: unknown) => bindingOf(binding)?.elementId === movedId;
    if (!joins((element as any).startBinding) && !joins((element as any).endBinding)) continue;
    resolveArrowBindings([element], board);
    bumpVersion(element);
    rerouted.push(element);
  }
  return rerouted;
}

function settleBoundTexts(containerIds: string[], board: Map<string, ServerElement>): ServerElement[] {
  const moved: ServerElement[] = [];
  for (const move of recentreBoundTexts([...board.values()], containerIds)) {
    const text = board.get(move.id);
    if (!text) continue;
    text.x = move.x;
    text.y = move.y;
    bumpVersion(text);
    moved.push(text);
  }
  return moved;
}

function restateLabels(written: ServerElement[], board: Map<string, ServerElement>): ServerElement[] {
  const restated = relabelBoundTexts(written, board);
  for (const element of restated) {
    bumpVersion(element, board.get(element.id) ?? element);
    board.set(element.id, element);
  }
  return restated;
}

function settleAfterWrite(movedIds: string[], board: Map<string, ServerElement>): ServerElement[] {
  const containers: string[] = [];
  const moved = new Map<string, ServerElement>();
  for (const id of movedIds) {
    const element = board.get(id);
    if (!element) continue;
    containers.push(id);
    if (typeof element.containerId === 'string' && element.containerId) {
      containers.push(element.containerId);
    }
    if (element.type !== 'arrow' && element.type !== 'line') {
      for (const arrow of rerouteBoundArrows(id, board)) {
        moved.set(arrow.id, arrow);
        containers.push(arrow.id);
      }
    }
  }
  for (const text of settleBoundTexts(containers, board)) moved.set(text.id, text);
  return [...moved.values()];
}

function settleDocument(
  applied: Pick<AppliedElementInput, 'created' | 'updated' | 'deleted'>,
  board: Map<string, ServerElement>
): Pick<AppliedElementInput, 'created' | 'updated' | 'deleted'> {
  const { alsoDeleted, changed } = settleDeletions(applied.deleted, board);
  const repaired = repairIndices(board);
  if (alsoDeleted.length === 0 && changed.length === 0 && repaired.length === 0) return applied;
  const created = new Map(applied.created.map(element => [element.id, element]));
  const updated = new Map(applied.updated.map(element => [element.id, element]));
  for (const element of [...changed, ...repaired]) {
    if (created.has(element.id)) created.set(element.id, element);
    else updated.set(element.id, element);
  }
  for (const id of alsoDeleted) {
    created.delete(id);
    updated.delete(id);
  }
  return {
    created: [...created.values()].filter(element => board.has(element.id)),
    updated: [...updated.values()].filter(element => board.has(element.id)),
    deleted: [...applied.deleted, ...alsoDeleted]
  };
}

interface PreparedElementInput {
  created: ServerElement[];
  updated: Map<string, ServerElement>;
  namedIds: string[];
  moved?: string[];
}

function applyAgentInput(
  board: Map<string, ServerElement>,
  upserts: Record<string, unknown>[]
): PreparedElementInput {
  const created: ServerElement[] = [];
  const updated = new Map<string, ServerElement>();
  const moved: string[] = [];
  const written: ServerElement[] = [];
  const namedIds: string[] = [];
  const statedIds = new Set(
    upserts.map(raw => raw.id).filter((id): id is string => typeof id === 'string' && id.length > 0)
  );
  const minted = new Set<string>();
  const taken = { has: (id: string) => board.has(id) || statedIds.has(id) || minted.has(id) };

  for (const raw of upserts) {
    const rawId = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : undefined;
    const existing = rawId ? board.get(rawId) : undefined;
    if (existing) {
      const merge = mergeElementUpdate(existing, raw);
      board.set(existing.id, merge.element);
      if (merge.reboundArrow) resolveArrowBindings([merge.element], board);
      if (merge.geometryChanged || merge.reboundArrow) moved.push(existing.id);
      updated.set(existing.id, merge.element);
      written.push(merge.element);
      namedIds.push(existing.id);
      continue;
    }

    const element = wellFormNewElement(raw, taken);
    minted.add(element.id);
    board.set(element.id, element);
    created.push(element);
    written.push(element);
    namedIds.push(element.id);
  }

  if (created.length > 0) {
    resolveArrowBindings(created, board, true);
    created.forEach(sizeFromPath);
  }

  for (const label of restateLabels(written, board)) {
    updated.set(label.id, label);
    moved.push(label.id);
  }
  const directIds = new Set(written.map(element => element.id));
  for (const element of expandForBoard(written, board)) {
    board.set(element.id, element);
    if (directIds.has(element.id)) {
      if (updated.has(element.id)) updated.set(element.id, element);
      const position = created.findIndex(candidate => candidate.id === element.id);
      if (position !== -1) created[position] = element;
    } else {
      created.push(element);
    }
  }

  return { created, updated, namedIds, moved };
}

function applyHumanInput(
  board: Map<string, ServerElement>,
  upserts: Record<string, unknown>[],
  timestamp?: string
): PreparedElementInput {
  const created: ServerElement[] = [];
  const updated = new Map<string, ServerElement>();
  const namedIds: string[] = [];
  const now = new Date().toISOString();
  for (const raw of upserts) {
    const {
      board: _board,
      id: rawId,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      version: _version,
      syncedAt: _syncedAt,
      source: _source,
      syncTimestamp: _syncTimestamp,
      ...incoming
    } = raw;
    const id = typeof rawId === 'string' && rawId.length > 0 ? rawId : mintId(board);
    const existing = board.get(id);
    const element = {
      ...(existing ?? {}),
      ...incoming,
      id,
      createdAt: existing?.createdAt ?? now,
      source: 'frontend_sync',
      syncedAt: now,
      ...(timestamp ? { syncTimestamp: timestamp } : {})
    } as ServerElement;
    bumpVersion(element, existing, now);
    board.set(id, element);
    namedIds.push(id);
    if (existing) updated.set(id, element);
    else created.push(element);
  }
  return { created, updated, namedIds };
}

/**
 * Convert one input-spelling write into the board shape and apply it to the
 * request-local board map. This is the only entry that owns the stage order.
 * Persistence, broadcast and the HTTP answer stay with the caller.
 */
export function applyElementInput(
  board: Map<string, ServerElement>,
  request: ElementInputRequest
): AppliedElementInput {
  // This function is public as well as the write door's conversion stage. Do
  // the whole conversion against an isolated document, then replace the
  // caller's map only after well-forming and validation both succeed.
  const working = new Map(
    copyElements(board.values()).map(element => [element.id, element])
  );
  const upserts = request.upserts ?? [];
  const deletes = request.deletes ?? [];
  const prepared = request.origin === 'agent'
    ? applyAgentInput(working, upserts)
    : applyHumanInput(working, upserts, request.timestamp);
  const deleted: string[] = [];
  for (const id of deletes) {
    if (working.delete(id)) deleted.push(id);
  }
  // Capture what the caller intended before the sole input converter repairs
  // bindings, dependent elements, ids, and ordering. A pane acknowledgement
  // compares this request-local document with the canonical document that was
  // persisted; otherwise a repair performed below is invisible to that pane.
  const requested = copyElements(working.values());
  for (const element of settleAfterWrite(prepared.moved ?? [], working)) {
    if (working.has(element.id)) prepared.updated.set(element.id, element);
  }
  const settled = settleDocument({
    created: prepared.created,
    updated: [...prepared.updated.values()].filter(element => working.has(element.id)),
    deleted
  }, working);
  validateRenderGeometry(working.values());
  const applied = {
    named: prepared.namedIds.flatMap(id => {
      const element = working.get(id);
      return element ? [element] : [];
    }),
    requested,
    ...settled
  };
  board.clear();
  for (const [id, element] of working) board.set(id, element);
  return applied;
}
