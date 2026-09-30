// The video encoder of a recording: ffmpeg, found and proven before a browser starts (TASK-381).

export {
	EncoderUnavailableError,
	findFfmpeg,
	probeFfmpeg,
	type FfmpegCommand,
	type FfmpegLookups,
} from "@/runtime/video-encoder/lib/ffmpeg";
