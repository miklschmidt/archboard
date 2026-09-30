// The video encoder of a recording: ffmpeg, found and proven before a browser starts, then run
// on the frames the renderer draws (TASK-381).

export {
	VideoEncodingError,
	openVideoEncoder,
	type VideoEncoder,
	type VideoEncoderOptions,
} from "@/runtime/video-encoder/lib/encode";
export {
	EncoderUnavailableError,
	findFfmpeg,
	probeFfmpeg,
	type FfmpegCommand,
	type FfmpegLookups,
} from "@/runtime/video-encoder/lib/ffmpeg";
