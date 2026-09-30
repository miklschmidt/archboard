// A recording's picture, rendered frame by frame against the talk it recorded
// (TASK-381): the page the recorder drives to draw each frame. The contract with
// the recorder is in `@/shared/walkthrough-recording/talk`.

export { TalkPlayback, frameOf, type TalkMoment } from "@/ui/walkthrough-replay/lib/talk-playback";
