import { useMemo } from "react";

import type { Reader } from "#ui/architecture-drawing/model-reader/hooks/use-reader.ts";
import type { kindLookOf } from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";

/**
 * What the picture on screen draws each subject with, by subject, so that a page or the panel draws a
 * kind with the icon the picture gives it.
 * @param scene The scene on screen, or null before one is drawn.
 * @returns The appearances, empty before a scene is drawn.
 */
function useSceneAppearances(scene: Reader["accepted"]["scene"]): Parameters<typeof kindLookOf>[1] {
	return useMemo(() => new Map(scene?.picture.appearances.map((one) => [one.id, one])), [scene]);
}

export { useSceneAppearances };
