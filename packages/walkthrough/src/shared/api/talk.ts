// The talk: what the recording page keeps (the voice and a log stamped on its samples), the clock it is stamped on, the frames drawn from it, and the replay page that renders it: the address that opens it and the page's side published on it. Safe for the browser.
export {
	framesOf,
	publishReplayPage,
	replayAskedOf,
	SAMPLES_PER_FRAME,
	TALK_SAMPLE_RATE,
} from "#shared/protocol/talk.ts";
export type { Talk } from "#shared/protocol/talk.ts";
