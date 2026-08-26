// Fill defaults — the reason a shape can be selected in the middle.
//
// Excalidraw only hit-tests a shape's interior when it is "draggable from
// inside", which its collision code defines as
//
//   !isTransparent(backgroundColor) || hasBoundTextElement(el) || ...
//
// so a transparent shape is selectable on its ~10px stroke and nowhere else,
// unless it happens to carry a bound label. A filled interior makes the whole
// box a selection target and, on a touch display, a practical touch point.
// That makes a background fill part of the interaction, not decoration: every
// promotion starts by selecting the boxes to promote.
//
// Leaning on the bound-label exception is not a fix: it is an Excalidraw
// internal, it does not cover a user-drawn box, and it does not cover a node
// whose text is a free-standing element rather than a bound label.
//
// Every colour here comes from the palette in
// skills/archboard/references/cheatsheet.md, which is the tracked reference
// the agent skill uses. Nothing invented.

// Fills apply to closed shapes only. Arrows, lines, text and freedraw either
// ignore backgroundColor or change meaning when filled.
export const FILLABLE_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

// The neutral: an interior that is there without saying anything. White reads
// as "just a box" on a light canvas and inverts to near-black on a dark one,
// so the board looks the way it did before — its interior is only now selectable.
export const DEFAULT_SHAPE_BACKGROUND = "#ffffff";

// Hachure over a fill is sketchy and, at low contrast, invisible. Solid is
// what the tracked skill reference tells agents to use.
export const DEFAULT_FILL_STYLE = "solid";

// Excalidraw's own test: "transparent", or an 8-digit hex with a zero alpha.
export function isTransparentBackground(color: unknown): boolean {
	if (typeof color !== "string" || color === "") return true;
	const c = color.trim().toLowerCase();
	if (c === "transparent") return true;
	if (c.length === 5 && c.startsWith("#") && c[4] === "0") return true;
	if (c.length === 9 && c.startsWith("#") && c.slice(7) === "00") return true;
	return false;
}

// A promoted node is worth telling apart from a scratch box, and kind is the
// one thing every node has. These pairings are the skill reference's stroke
// semantics — purple services, orange queues/events, cyan data stores, blue
// front doors, gray secondary — read across to its pastel fills.
export const KIND_BACKGROUND: Record<string, string> = {
	service: "#eebefa", // light purple
	queue: "#ffd8a8", // light orange
	datastore: "#99e9f2", // light cyan
	gateway: "#a5d8ff", // light blue
	external: "#e9ecef", // light gray
};

export function backgroundForKind(kind: string): string {
	return KIND_BACKGROUND[kind] ?? DEFAULT_SHAPE_BACKGROUND;
}
