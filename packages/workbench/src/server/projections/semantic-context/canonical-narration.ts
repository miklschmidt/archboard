import { readArchitectureModel } from "@archboard/board/store-read";
import type { ArchitectureModelRead } from "@archboard/board/model";
import type { SemanticPaneContextSchema } from "@archboard/board/pane-context";
import type { z } from "zod";
import type { RealtimePresentationChange } from "#runtime/rules/realtime/presentation-mode.ts";
import { canonicalNarratedSubjects } from "#server/rules/semantic-context/narrated-subjects.ts";

type Architecture = NonNullable<z.infer<typeof SemanticPaneContextSchema>["architecture"]>;
type Model = Extract<ArchitectureModelRead, { success: true }>;
type Capture = Model & { playback: NonNullable<Model["playback"]> };

/**
 * Resolve authored narration through the public reader and retain both revision guards.
 * @param architecture The pane's address and observed revisions.
 * @param walkthrough The requested narrative identity.
 * @returns One complete immutable capture.
 */
async function captureNarration(architecture: Architecture, walkthrough: string): Promise<Capture> {
	requireNarrativeSource(architecture, walkthrough);
	const model = await readArchitectureModel(architecture.vault, undefined, undefined, {
		...architecture.selection,
		model: architecture.model,
	});
	if (!model.success)
		throw new Error(
			`${model.code}: ${model.error} Reopen the walkthrough and start narration again.`,
		);
	if (!matchesCapture(model, architecture))
		throw new Error(
			"MODEL_CHANGED: The narrative source or target changed. Reopen the walkthrough and start narration again.",
		);
	if (model.playback === undefined) throw new Error("The captured narrative is unavailable.");
	return { ...model, playback: model.playback };
}

/**
 * Compare a pane's address and guards to the retained public read receipt.
 * @param model The retained architecture.
 * @param architecture The pane's current report.
 * @returns Whether the pane still reports this captured architecture.
 */
function matchesCapture(model: Model, architecture: Architecture): boolean {
	return (
		model.manifest.id === architecture.model &&
		model.revision.digest === architecture.expectedRevision &&
		model.playback?.sourceRevision.digest === architecture.expectedSourceRevision
	);
}

/**
 * Explain only the exact available beat in the retained capture.
 * @param model The server-owned capture.
 * @param beat The arrived zero-based position.
 * @returns Authored narration or absence for an unavailable beat.
 */
function canonicalNarrationChange(model: Capture, beat: number): RealtimePresentationChange | null {
	const playback = model.playback;
	const selected = playback.walkthrough.beats[beat];
	if (
		selected === undefined ||
		playback.beats[beat]?.id !== selected.id ||
		playback.beats[beat].status !== "ready"
	)
		return null;
	return {
		kind: "stepped",
		step: beat + 1,
		of: playback.walkthrough.beats.length,
		heading: selected.title,
		body: selected.narrative,
		subjects: canonicalNarratedSubjects(model, selected.reading.selection),
	};
}

export { captureNarration, matchesCapture, canonicalNarrationChange };

/**
 * Require the source address before resolving its authored content.
 * @param architecture The pane's address and source guard.
 * @param walkthrough The chosen stable narrative identity.
 */
function requireNarrativeSource(architecture: Architecture, walkthrough: string): void {
	if (
		architecture.selection?.walkthrough !== walkthrough ||
		architecture.expectedSourceRevision === undefined
	)
		throw new Error(
			"The pane has no captured narrative source. Reopen the walkthrough and start narration again.",
		);
}
