// Recording a walkthrough to a video file and rendering it again from a kept talk, with the talk on disk.
export { recordingPageUrl, recordWalkthrough } from "#runtime/operations/record-walkthrough.ts";
export { renderTalk } from "#runtime/operations/render-talk.ts";
export {
	askedTalkPlace,
	readTalk,
	requireFreshPlace,
	stateTalkPlace,
	TalkFileError,
	writeTalk,
} from "#runtime/store/talk-files.ts";
export type { TalkPlace } from "#runtime/store/talk-files.ts";
