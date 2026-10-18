// Code checks and language-server analysis wait until they finish or their
// caller cancels them. Only cleanup has a deadline (TASK-436.02).

/**
 * From shutdown to process exit, then kill the server and its process group.
 * No further answer is needed during cleanup. TypeScript 7.0.2 took 19 to 27 ms
 * on 2026-10-06; 2 seconds lets normal shutdown finish before escalation.
 */
const LANGUAGE_SERVER_STOP_MS = 2000;

export { LANGUAGE_SERVER_STOP_MS };
