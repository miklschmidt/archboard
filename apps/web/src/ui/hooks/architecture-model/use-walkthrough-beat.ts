import { useMemo } from "react";
import {
	useWalkthrough,
	type DrivenPlace,
} from "#ui/architecture-drawing/canvas/picture/transitions/hooks/use-walkthrough.ts";
import type { Model } from "@archboard/model/content";

type Playback = NonNullable<Model["playback"]>;
type Reading = Playback["walkthrough"]["beats"][number]["reading"];
const ROOT_READING: Reading = {
	grammar: "architecture",
	selection: [],
	focus: [],
	filters: { relationships: [], groups: [] },
};

/**
 * Resolve manual and driven positions against one captured narrative.
 * @param model The captured architecture.
 * @param playback The resolved narrative.
 * @param driven A requested position, null for the recording overview, or absent for manual playback.
 * @param first The step manual playback opens at.
 * @returns The complete authored reading and shared presentation controls.
 */
function useWalkthroughBeat(
	model: Model,
	playback: Playback,
	driven: DrivenPlace | null | undefined,
	first = 0,
) {
	const caption = useMemo(() => captionOf(playback), [playback]);
	const offered = useMemo(() => ({ walkthroughs: [caption], nameOf: subjectName }), [caption]);
	const initial = useMemo(
		() => ({
			request: `open:${playback.walkthrough.id}`,
			walkthrough: playback.walkthrough.id,
			beat: first,
			answers: false,
		}),
		[playback.walkthrough.id, first],
	);
	const position = useWalkthrough(
		{ model: model.manifest.id, variant: model.checkpoint?.id },
		offered,
		driven === undefined ? initial : drivenPlace(driven, playback, caption.beats.length),
	);
	const beat = readingAt(playback, position.beatIndex);
	return { ...beat, key: `${model.revision.digest}:${beat.id}`, caption, position };
}

/**
 * The position that is asked for, when it is a place in this walkthrough.
 * @param driven The requested position, or null for the recording overview.
 * @param playback The resolved narrative.
 * @param beats How many beats it has.
 * @returns The position, or null.
 */
function drivenPlace(driven: DrivenPlace | null, playback: Playback, beats: number) {
	return driven?.walkthrough === playback.walkthrough.id && driven.beat < beats ? driven : null;
}

/**
 * A caption keeps the authored subject identity when it needs a fallback name.
 * @param id The subject identity.
 * @returns The unchanged identity.
 */
function subjectName(id: string): string {
	return id;
}

/**
 * Translate authored text for the existing caption and position owners.
 * @param playback The captured walkthrough.
 * @returns Caption text without architecture copies.
 */
function captionOf(playback: Playback): NonNullable<ReturnType<typeof useWalkthrough>["open"]> {
	return {
		id: playback.walkthrough.id,
		name: playback.walkthrough.name,
		beats: playback.walkthrough.beats.map((entry) => ({
			id: entry.id,
			heading: entry.title,
			body: entry.narrative,
			subjects: entry.reading.selection,
		})),
	};
}

/**
 * Keep the recording overview distinct from authored narrative beats.
 * @param playback The captured narrative and its readiness results.
 * @param index The shared position, or minus one for the overview.
 * @returns Complete reading instructions and any explicit unavailable beat.
 */
function readingAt(playback: Playback, index: number) {
	const beat = playback.walkthrough.beats[index];
	if (beat === undefined) return { id: "overview", reading: ROOT_READING, unavailable: null };
	const status = playback.beats[index]!;
	return {
		id: beat.id,
		reading: beat.reading,
		unavailable: status.status === "ready" ? null : status,
	};
}

export { useWalkthroughBeat };
