// Server-owned model rendering (ADR 0020): the private Chromium that draws a
// model to PNG or SVG, the one a recording drives, and the native clipboard a
// CLI copy hands the image to.

import { bound, handed, polled } from "#shared/constants/uses.ts";

/**
 * Bound for one serialized PNG or SVG job in the private renderer. This is intentionally half the
 * proof harness's 20-second fault deadline. Product work renders one immutable request and reports
 * its named page phase when this bound expires.
 */
const RASTER_JOB_MS = 10_000;

/**
 * Bound for starting a private Chromium: its control port, then its browser connection. Startup is
 * lazy, so it delays the first Model render or recording only. It pulls against how soon an
 * operator learns that Chromium cannot start. Ten seconds completed three cold starts under a
 * half-CPU quota (TASK-162), but hosted Linux cold starts exceeded it in 2 of 5 gate runs (October
 * 2026, TASK-470).
 */
const CHROMIUM_START_MS = 30_000;

/** A private Chromium and the renderer's bounds on it. */
const RASTER = {
	"chromium.start": bound(
		CHROMIUM_START_MS,
		"Chromium to start and accept its DevTools connection",
	),
	/** Chromium writing its DevTools port, inside its start. */
	"chromium.devToolsPort": polled(CHROMIUM_START_MS, "Chromium to open its DevTools port"),
	/** Opening a page or a window in a started Chromium, handed to its DevTools calls. */
	"chromium.openPage": handed(CHROMIUM_START_MS),
	/**
	 * Bound for each TERM and KILL phase of stopping a Chromium's process group. Two phases fit
	 * inside the CLI interrupt grace, leaving time to remove the private profile after the group is
	 * proved absent.
	 */
	"chromium.groupExit": polled(1000, "Chromium's process group to exit"),
	/**
	 * Bound for one DevTools command whose caller names none. A command to a private local Chromium
	 * answers in milliseconds, so this only decides how long a wedged browser is waited on before the
	 * caller hears so. It matches the renderer's job bound, which a cold page's commands fit inside.
	 */
	"chromium.call": handed(RASTER_JOB_MS),
	/** The renderer's bound on one job, handed to each of its DevTools calls. */
	"raster.job": handed(RASTER_JOB_MS),
	/** A job's document finishing its load, inside the job's bound. */
	"raster.documentLoad": polled(RASTER_JOB_MS, "the document to finish loading"),
};

export { RASTER };
