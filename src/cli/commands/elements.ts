import { parseArgs, CliUsageError } from '../args.js';
import { printJson, readJsonInput } from '../util.js';
import { prepareElement, prepareElementUpdate } from '../../core/normalize.js';
import {
  applyElementChanges,
  batchCreateElementsStrict,
  updateElementStrict,
  getElementStrict,
  getElements,
  searchElements
} from '../../core/canvas-client.js';
import { ensureCanvasRunning } from '../../core/spawn.js';
import { ServerElement } from '../../types.js';

// apply: primary mutation command — {create:[], update:[], delete:[]} in one
// invocation; a bare JSON array is shorthand for {create: [...]}.
function normalizePatchUpdate(update: any): { id: string; updates: Record<string, unknown> } {
  if (!update || typeof update !== 'object' || Array.isArray(update)) {
    throw new CliUsageError('Every update entry must be an object with an "id"');
  }
  if (!update.id) throw new CliUsageError('Every update entry needs an "id"');

  const { id, set, ...rest } = update;
  if (set === undefined) {
    return { id, updates: rest };
  }
  if (!set || typeof set !== 'object' || Array.isArray(set)) {
    throw new CliUsageError('Update entry "set" must be an object');
  }
  if (Object.keys(rest).length > 0) {
    throw new CliUsageError('Use either direct update fields or "set", not both');
  }
  return { id, updates: set };
}

export async function apply(argv: string[]): Promise<void> {
  const { positionals } = parseArgs(argv, {});
  const input = await readJsonInput(positionals[0], 'patch');

  const patch: { create?: any[]; update?: any[]; delete?: string[] } =
    Array.isArray(input) ? { create: input } : input;

  if (!patch.create?.length && !patch.update?.length && !patch.delete?.length) {
    throw new CliUsageError('Patch has no create/update/delete operations');
  }

  await ensureCanvasRunning();

  // Everything the patch names is resolved against the board before anything
  // is written, so an id that is not there is refused with nothing applied.
  // It used to be refused halfway through, with the updates before it already
  // on the board.
  const updates: (Partial<ServerElement> & { id: string })[] = [];
  const deletes = patch.delete ?? [];
  if (patch.update?.length || deletes.length) {
    const typeById = new Map((await getElements()).map(element => [element.id, element.type]));
    for (const update of patch.update ?? []) {
      const { id, updates: fields } = normalizePatchUpdate(update);
      const existingType = typeById.get(id);
      if (!existingType) throw new Error(`Element ${id} not found`);
      updates.push(prepareElementUpdate(id, fields, existingType));
    }
    for (const id of deletes) {
      if (!typeById.has(id)) throw new Error(`Element ${id} not found`);
    }
  }

  // One patch, one write: creates, updates and deletes all land in the same
  // pass over the board, so nothing else can get in between them.
  const creates = (patch.create ?? []).map(el => prepareElement(el));
  const result = await applyElementChanges({ upserts: [...creates, ...updates], deletes });

  printJson({
    success: true,
    created: result.created,
    // What the patch asked for, not what the board owed it afterwards: the
    // server also re-routes arrows and re-places labels behind a move, and
    // counting those here would answer a question nobody asked.
    updated: updates.length,
    deleted: result.deleted,
    elements: result.elements
  });
}

// add: batch create (alias for apply with a bare array); --one '<json>' for a
// single element without wrapping it in [].
export async function add(argv: string[]): Promise<void> {
  const { positionals, flags } = parseArgs(argv, { one: { takesValue: true } });

  let elements: any[];
  if (typeof flags.one === 'string') {
    try {
      elements = [JSON.parse(flags.one)];
    } catch (error) {
      throw new CliUsageError(`Invalid JSON in --one: ${(error as Error).message}`);
    }
  } else {
    const input = await readJsonInput(positionals[0], 'elements');
    elements = Array.isArray(input) ? input : [input];
  }

  await ensureCanvasRunning();
  const created = await batchCreateElementsStrict(elements.map(el => prepareElement(el)));
  printJson({ success: true, count: created.length, elements: created });
}

export async function update(argv: string[]): Promise<void> {
  const { positionals, flags } = parseArgs(argv, { set: { takesValue: true } });
  const id = positionals[0];
  if (!id) throw new CliUsageError('Usage: update <id> --set \'{"backgroundColor": "#ffc9c9"}\'');

  let updates: Record<string, unknown>;
  if (typeof flags.set === 'string') {
    try {
      updates = JSON.parse(flags.set);
    } catch (error) {
      throw new CliUsageError(`Invalid JSON in --set: ${(error as Error).message}`);
    }
  } else {
    updates = await readJsonInput(positionals[1], 'updates');
  }

  await ensureCanvasRunning();
  // Fetch the real type so text→label conversion skips text elements
  const existing = await getElementStrict(id);
  const element = await updateElementStrict(prepareElementUpdate(id, updates, existing.type));
  printJson({ success: true, element });
}

export async function del(argv: string[]): Promise<void> {
  const { positionals } = parseArgs(argv, {});
  if (positionals.length === 0) throw new CliUsageError('Usage: delete <id> [<id> ...]');

  await ensureCanvasRunning();

  // One delete, however many ids: every id is resolved against one read of the
  // board and then all of them go in a single write, the shape `apply` has.
  // It used to be a DELETE per id, so an id the board did not hold was refused
  // with the ones before it already gone (ADR 0015).
  const onBoard = new Set((await getElements()).map(element => element.id));
  const missing = positionals.filter(id => !onBoard.has(id));
  if (missing.length > 0) throw new Error(`Element ${missing.join(', ')} not found`);
  await applyElementChanges({ deletes: positionals });

  printJson({ success: true, deleted: positionals, count: positionals.length });
}

export async function get(argv: string[]): Promise<void> {
  const { positionals } = parseArgs(argv, {});
  const id = positionals[0];
  if (!id) throw new CliUsageError('Usage: get <id>');

  await ensureCanvasRunning();
  printJson(await getElementStrict(id));
}

// Coerce "true"/"false"/numeric strings so --filter locked=true works against
// real element values (the server search endpoint only compares raw strings).
function coerce(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return value;
}

function lookupPath(obj: any, dotPath: string): unknown {
  return dotPath.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

export async function query(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv, {
    type: { takesValue: true },
    bbox: { takesValue: true },
    filter: { takesValue: true, repeatable: true },
    'filter-json': { takesValue: true }
  });

  await ensureCanvasRunning();

  // type + bbox filter server-side via the search endpoint. --bbox is a region
  // to overlap, not a range for an origin to sit in, so an arrow crossing it
  // is found however far away it started.
  const queryParams = new URLSearchParams();
  if (typeof flags.type === 'string') queryParams.set('type', flags.type);
  if (typeof flags.bbox === 'string') {
    const parts = flags.bbox.split(',').map(s => Number(s.trim()));
    if (parts.length !== 4 || parts.some(Number.isNaN)) {
      throw new CliUsageError('--bbox expects "x_min,y_min,x_max,y_max"');
    }
    const [xMin, yMin, xMax, yMax] = parts as [number, number, number, number];
    queryParams.set('x_min', String(xMin));
    queryParams.set('y_min', String(yMin));
    queryParams.set('x_max', String(xMax));
    queryParams.set('y_max', String(yMax));
  }

  let results = queryParams.size > 0
    ? await searchElements(queryParams)
    : await getElements();

  // key=value / nested / typed predicates filter client-side. Each k=v pair
  // matches on the coerced value (`locked=true` → boolean) OR the raw string
  // (`id=123` must still find id: "123").
  const predicates: Array<(el: ServerElement) => boolean> = [];
  for (const pair of (flags.filter as string[] | undefined) || []) {
    const eq = pair.indexOf('=');
    if (eq === -1) throw new CliUsageError(`--filter expects key=value, got "${pair}"`);
    const key = pair.slice(0, eq);
    const raw = pair.slice(eq + 1);
    const coerced = coerce(raw);
    predicates.push(el => {
      const actual = lookupPath(el, key);
      if (Array.isArray(actual)) {
        return actual.includes(raw) || actual.includes(coerced as never);
      }
      return actual === coerced || actual === raw;
    });
  }
  if (typeof flags['filter-json'] === 'string') {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(flags['filter-json']);
    } catch (error) {
      throw new CliUsageError(`Invalid JSON in --filter-json: ${(error as Error).message}`);
    }
    for (const [key, expected] of Object.entries(obj)) {
      predicates.push(el => {
        const actual = lookupPath(el, key);
        if (Array.isArray(actual)) return actual.includes(expected as never);
        return actual === expected;
      });
    }
  }

  if (predicates.length > 0) {
    results = results.filter(el => predicates.every(matches => matches(el)));
  }

  printJson(results);
}
