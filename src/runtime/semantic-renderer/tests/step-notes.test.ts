import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { expect, test } from "bun:test";
import type { DiagramBox } from "@/shared/semantic-board/index";
import { renderDataFlow } from "@/runtime/semantic-renderer/index";
import {
	drawnSpan,
	drawnTexts,
	labelPlates,
	registeredFaces,
	spanFits,
} from "@/runtime/semantic-renderer/tests/drawn-text";

// A step's note is the caveat a sequence carries on one message: the branch,
// the loop's condition. A picture that leaves it out tells a reader less than
// the board says, so it is drawn whole, under its message, and the rest of the
// exchange makes room for it.

const NOTE =
	"tries wsgi.py then app.py unless FLASK_APP names the app or factory; within each, locate_app tries the attribute names";

/**
 * A short startup exchange whose loading step may carry a note.
 * @param note The loading step's note, if any.
 * @returns The content.
 */
function startup(note?: string) {
	return orderedFixture({
		nodes: [
			{ id: "cmd", name: "run_command", kind: "function" },
			{ id: "info", name: "ScriptInfo", kind: "module" },
			{ id: "serve", name: "run_simple", kind: "external" },
		],
		flows: [
			{
				id: "run",
				name: "flask run",
				participants: ["cmd", "info", "serve"],
				steps: [
					{ id: "s1", from: "cmd", to: "info", label: "load_app" },
					{
						id: "s2",
						from: "info",
						to: "info",
						label: "import candidate",
						kind: "self",
						repeat: 2,
						...(note === undefined ? {} : { note }),
					},
					{ id: "s3", from: "info", to: "cmd", label: "Flask app", kind: "return" },
					{ id: "s4", from: "cmd", to: "serve", label: "serve" },
				],
			},
		],
	});
}

/**
 * Whether two boxes share any area at all.
 * @param one The first box.
 * @param other The second.
 * @returns True when they overlap.
 */
function intersects(one: DiagramBox, other: DiagramBox): boolean {
	return (
		one.x < other.x + other.width &&
		other.x < one.x + one.width &&
		one.y < other.y + other.height &&
		other.y < one.y + one.height
	);
}

test("a self step's note is drawn whole under its loop, and the next message makes room for it", () => {
	const plain = renderDataFlow({ content: startup(), theme: "light" });
	const rendered = renderDataFlow({ content: startup(NOTE), theme: "light" });
	const faces = registeredFaces(rendered.svg);
	const words = drawnTexts(rendered.svg).filter(
		(text) => text.subject.id === "s2" && text.text !== "import candidate ×2",
	);

	// Every word, in order, across however many lines it wrapped to.
	expect(words.length).toBeGreaterThan(1);
	expect(words.map((text) => text.text.trim()).join(" ")).toBe(NOTE);
	const loop = rendered.atlas.edges["s2"]!;
	const plates = labelPlates(rendered.svg, "step");
	const frame = rendered.atlas.regions["run"]!;
	for (const text of words) {
		const span = drawnSpan(text, faces);
		// Inside the message it belongs to and the flow it is part of, below the
		// message's own label and above the next message's words.
		expect(spanFits(span, loop)).toBe(true);
		expect(spanFits(span, frame)).toBe(true);
		expect(text.y - text.size).toBeGreaterThan(plates.get("s2")!.y + plates.get("s2")!.height);
		expect(text.y).toBeLessThan(plates.get("s3")!.y);
	}
	expect(intersects(loop, rendered.atlas.edges["s3"]!)).toBe(false);
	// The rest of the exchange moved down to make that room.
	expect(rendered.atlas.edges["s3"]!.y).toBeGreaterThan(plain.atlas.edges["s3"]!.y);
});
