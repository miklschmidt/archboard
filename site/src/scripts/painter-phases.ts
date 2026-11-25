// What the site's painters (ADR 0071) are told about time, as the app tells its own.

import { painterPhasesJson } from "@archboard/timing";

/** At which points of a move each of its parts happens, as the painter reads them. */
export const PHASES = painterPhasesJson();
