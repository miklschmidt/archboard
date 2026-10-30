import { ArchitectureModelReadSchema, type ArchitectureModelRead } from "@archboard/board/model";
type CanonicalModel = Extract<ArchitectureModelRead, { success: true }>;
/**
 * Require one complete retained playback before recording or replay.
 * @param model The captured canonical reading.
 * @returns Contract failures or an empty list.
 */
function canonicalReadingProblems(model: CanonicalModel): string[] {
	const { checkpoint, playback } = model;
	if (!checkpoint || !playback) return ["Canonical playback requires one exact retained revision."];
	if (
		playback.checkpoint !== checkpoint.id ||
		playback.revision.digest !== model.revision.digest ||
		checkpoint.revision.digest !== model.revision.digest
	)
		return ["Canonical playback revisions disagree."];
	return readyBeatProblems(playback);
}
/**
 * Require each recorded beat to be available in the pinned reading.
 * @param playback The resolved narrative.
 * @returns Beat contract failures.
 */
function readyBeatProblems(playback: NonNullable<CanonicalModel["playback"]>): string[] {
	if (playback.beats.length !== playback.walkthrough.beats.length)
		return ["Canonical beat readiness is incomplete."];
	const unavailable = playback.beats.some(
		(beat, index) =>
			beat.id !== playback.walkthrough.beats[index]?.id ||
			beat.status !== "ready" ||
			beat.diagnostics.length > 0,
	);
	return unavailable ? ["Every recorded beat must be available in the captured reading."] : [];
}
/**
 * Decode a recording input through the shared model authority.
 * @param input The supplied exact reading.
 * @returns Its validated canonical model.
 */
function canonicalRecordingModel(input: CanonicalModel): CanonicalModel {
	const model = ArchitectureModelReadSchema.options[0].parse(input);
	const problems = canonicalReadingProblems(model);
	if (problems.length > 0) throw new Error(problems.join(" "));
	return model;
}
export { canonicalReadingProblems, canonicalRecordingModel, type CanonicalModel };
