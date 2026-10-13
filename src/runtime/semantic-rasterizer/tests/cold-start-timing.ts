// Test budget for the owners that start a real Chromium. It lives here and not
// in tests/system/support/timing.ts because a module's tests may not import
// another test owner (docs/agents/boundaries.md), and it is a literal and not
// computed from the product's startup bound, so that a product change never
// retunes a test (TASK-154).

/**
 * Bun's deadline for a case, or a hook, that cold-starts Chromium and then
 * draws with it. A hosted Linux runner's cold start took past ten seconds in 2
 * of 5 gate runs (TASK-470), both times before the browser connection opened.
 * The product gives that launch phase thirty seconds, and opening the page
 * another thirty. This is the launch's thirty plus fifteen seconds for the page
 * and the drawing, so it is below the two phases' sixty: a page that also
 * stalls fails here first. It is a ceiling that a passing run never reaches;
 * the 60 s wall-clock budget still applies to every case.
 */
const TEST_CHROMIUM_COLD_START_CASE_MS = 45_000;

export { TEST_CHROMIUM_COLD_START_CASE_MS };
