// Why a recording or a render did not happen.

/** Why a recording or a render did not happen. */
type WalkthroughRecordingErrorCode =
	/** No Chromium-family browser was found, or it would not start. */
	| "RECORDER_UNAVAILABLE"
	/** The page could not start recording, or failed before it showed a step: nothing was recorded. */
	| "RECORDING_REFUSED"
	/** The recording showed a step and did not finish. */
	| "RECORDING_FAILED"
	/** A talk's picture could not be rendered to a file; the talk is kept. */
	| "RENDER_FAILED";

/** A recording that did not happen, with the stable half of why. */
class WalkthroughRecordingError extends Error {
	readonly code: WalkthroughRecordingErrorCode;

	/**
	 * Fail a recording.
	 * @param code Which failure.
	 * @param message What happened and what to do.
	 * @param cause What failed underneath.
	 */
	constructor(code: WalkthroughRecordingErrorCode, message: string, cause?: unknown) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = "WalkthroughRecordingError";
		this.code = code;
	}
}

export { WalkthroughRecordingError, type WalkthroughRecordingErrorCode };
