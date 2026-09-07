/** The element types the inspection knows how to reason about. */
const KNOWN_ELEMENT_TYPES = new Set([
	"rectangle",
	"ellipse",
	"diamond",
	"frame",
	"text",
	"arrow",
	"line",
	"image",
	"freedraw",
]);

/** The element types that enclose an interior, which is what makes a rotation matter. */
const CLOSED_ELEMENT_TYPES = new Set(["rectangle", "ellipse", "diamond", "frame"]);

export { CLOSED_ELEMENT_TYPES, KNOWN_ELEMENT_TYPES };
