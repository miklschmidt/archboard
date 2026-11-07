// Recording a walkthrough to a video file and rendering it again from a kept talk, with the talk on disk.
export {
	recordingPageUrl,
	recordWalkthrough,
} from "#runtime/recorder/operations/record-walkthrough.ts";
export { renderTalk } from "#runtime/recorder/operations/render-talk.ts";
export { recordingContainerOf } from "#runtime/recorder/services/recording-tools.ts";
export {
	freshTalkPlace,
	keepTalk,
	readTalk,
	TalkFileError,
} from "#runtime/recorder/store/talk-files.ts";
