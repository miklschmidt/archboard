// An object literal at module scope that something writes to later is state,
// and a reload silently rewinds it to whatever the literal says. This is
// `sceneState` in shape: a theme and a viewport somebody set, back to the
// defaults, with no error anywhere.

export const sceneState = {
  theme: 'light',
  viewport: { x: 0, y: 0, zoom: 1 }
};

export function setTheme(theme: string): void {
  sceneState.theme = theme;
}
