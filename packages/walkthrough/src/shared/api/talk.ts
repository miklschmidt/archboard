// The talk: what the recording page keeps (the voice and a log stamped on its samples), the frames drawn from it, and the address that opens the page that replays it. Safe for the browser.
export {
	framesOf,
	REPLAY_PAGE_GLOBAL,
	replayAskedOf,
	ReplayOptionsSchema,
	SAMPLES_PER_FRAME,
	TALK_FORMAT,
	TALK_FRAME_RATE,
	TALK_SAMPLE_RATE,
	TALK_VERSION,
	TALK_VOICE_FILE,
	TalkSchema,
} from "#shared/protocol/talk.ts";
export type { ReplayPage, Talk, TalkEvent, TalkLog } from "#shared/protocol/talk.ts";
