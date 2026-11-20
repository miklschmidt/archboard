// When the model's measured output counts as speech: what the orb and a recording read as audible.

/** The RMS level at or above which the model counts as speaking. */
const SPEAKING_LEVEL = 0.02;

/**
 * Whether a measured output level counts as the model speaking.
 * @param level The RMS level, 0..1.
 * @returns True at or above the speaking level.
 */
function isSpeakingLevel(level: number): boolean {
	return level >= SPEAKING_LEVEL;
}

export { isSpeakingLevel };
