// Fill defaults — the reason a shape can be tapped in the middle.
//
// Excalidraw only hit-tests a shape's interior when it is "draggable from
// inside", which its collision code defines as
//
//   !isTransparent(backgroundColor) || hasBoundTextElement(el) || ...
//
// so a transparent shape is selectable on its ~10px stroke and nowhere else,
// unless it happens to carry a bound label. On a 75-inch touchscreen nobody
// taps a 2px border; they tap the box. That makes a background fill part of
// the interaction, not decoration — the whole promotion gesture ("select these
// boxes, map this to the payments service") starts with a tap landing.
//
// Leaning on the bound-label exception is not a fix: it is an Excalidraw
// internal, it does not cover a hand-drawn box, and it does not cover a node
// whose text is a free-standing element rather than a bound label.
//
// Every colour here comes from the palette in design-guide.ts, which is the
// same palette the agent skill tells agents to draw with. Nothing invented.

// Fills apply to closed shapes only. Arrows, lines, text and freedraw either
// ignore backgroundColor or change meaning when filled.
export const FILLABLE_TYPES = new Set(['rectangle', 'ellipse', 'diamond']);

// The neutral: an interior that is there without saying anything. White reads
// as "just a box" on a light canvas and inverts to near-black on a dark one,
// so the board looks the way it did before — it is only now tappable.
export const DEFAULT_SHAPE_BACKGROUND = '#ffffff';

// Hachure over a fill is sketchy and, at low contrast, invisible. Solid is
// what the design guide tells agents to use.
export const DEFAULT_FILL_STYLE = 'solid';

// Excalidraw's own test: "transparent", or an 8-digit hex with a zero alpha.
export function isTransparentBackground(color: unknown): boolean {
  if (typeof color !== 'string' || color === '') return true;
  const c = color.trim().toLowerCase();
  if (c === 'transparent') return true;
  if (c.length === 5 && c.startsWith('#') && c[4] === '0') return true;
  if (c.length === 9 && c.startsWith('#') && c.slice(7) === '00') return true;
  return false;
}

// A promoted node is worth telling apart from a scratch box, and kind is the
// one thing every node has. These pairings are the design guide's own stroke
// semantics — purple services, orange queues/events, cyan data stores, blue
// front doors, gray secondary — read across to its pastel fills.
export const KIND_BACKGROUND: Record<string, string> = {
  service: '#eebefa',    // light purple
  queue: '#ffd8a8',      // light orange
  datastore: '#99e9f2',  // light cyan
  gateway: '#a5d8ff',    // light blue
  external: '#e9ecef'    // light gray
};

export function backgroundForKind(kind: string): string {
  return KIND_BACKGROUND[kind] ?? DEFAULT_SHAPE_BACKGROUND;
}
