// The history lens (ADR 0045): the Git history of each board, read through
// its bindings, on request, and never stored.
//
// Bindings map commits to paths for behind, and to declarations or paths for
// locality and footprint. Behind, how far a board is behind its code, answers in
// `archboard check --code`. Hotspots, change coupling and footprints
// (TASK-369.03 to TASK-369.05) reuse the walk, the mapping and the part
// reading exported here.

export {
	type BehindReading,
	type BoardToRead,
	createBehindReading,
} from "@/runtime/history-lens/lib/behind";
export {
	type FileChange,
	type WalkedCommit,
	commitsByBoundPath,
	isLargeCommit,
	walkCommits,
} from "@/runtime/history-lens/lib/commits";
export { type PartReading, type ReadPart, partReading } from "@/runtime/history-lens/lib/parts";
export { type LocalityReading, createLocalityReading } from "@/runtime/history-lens/lib/locality";
export { type AnswerMemory, createAnswerMemory } from "@/runtime/history-lens/lib/answer-memory";
export { type FootprintRequest, readFootprint } from "@/runtime/history-lens/lib/footprint";
