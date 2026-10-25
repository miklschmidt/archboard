// Recording a walkthrough to a video file and rendering it again from a kept talk, with the talk on disk.
export { recordingPageUrl, recordWalkthrough } from "#runtime/operations/record-walkthrough.ts";
export { renderTalk } from "#runtime/operations/render-talk.ts";
export { recordingContainerOf } from "#runtime/services/recording-tools.ts";
export { freshTalkPlace, keepTalk, readTalk, TalkFileError } from "#runtime/store/talk-files.ts";
