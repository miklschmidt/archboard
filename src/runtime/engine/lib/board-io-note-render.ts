// The note a board's content would be written as.

import { type ServerElement } from "@/runtime/engine/types";
import { type BoardState } from "@/runtime/engine/board-store";
import { boardKey, renderBoardNote } from "@/runtime/engine/board";
import { stripBindingPresentationLinks } from "@/runtime/engine/presentation";
import { buildScene } from "@/runtime/engine/scene-document";
import { packElementTracking } from "@/runtime/engine/metadata";
import { type BoardContent, boardFilesMessage } from "@/runtime/engine/lib/board-io-content";

/**
 * The note a board's content would be written as.
 *
 * `existingNote` is what is at the destination: its frontmatter and prose are
 * carried across verbatim and only the identity keys are touched, which is what
 * keeps two writes of an unchanged board byte-identical. It defaults to the note
 * this content came out of, and a write passes the destination's instead —
 * `board save --as other` writes a file some other note's frontmatter belongs
 * to.
 * @param identity The board the note is for.
 * @param content The board.
 * @param existingNote The destination's current text, when it has one.
 * @returns The note's text and bytes, and how many elements it holds.
 */
function renderContent(
	identity: BoardState["identity"],
	content: BoardContent,
	existingNote: string | null | undefined = content.note,
): { note: string; bytes: Buffer; elementCount: number } {
	const files = boardFilesMessage(content).files ?? {};
	const { scene, elementCount } = buildScene(
		stripBindingPresentationLinks(
			Array.from(content.elements.values(), (element) => packElementTracking(element)),
			{ boardKey: boardKey(identity) },
		),
		files,
		{ keepServerFields: true },
	);
	// expandElements normalizes a missing link to null, so apply the same
	// portability rule once more to the normalized copies.
	scene["elements"] = stripBindingPresentationLinks(
		// buildScene types the scene as the generic record Excalidraw reads, but its
		// elements are the expanded copies of the ServerElements handed in above
		// with the server fields kept, so they are board elements by construction.
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above: expanded copies of this board's own elements
		(scene["elements"] as ServerElement[]).map(packElementTracking),
		{ boardKey: boardKey(identity) },
	);
	const note = renderBoardNote(scene, existingNote, identity);
	return { note, bytes: Buffer.from(note, "utf-8"), elementCount };
}

export { renderContent };
