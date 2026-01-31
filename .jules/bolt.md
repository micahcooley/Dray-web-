## 2026-01-31 - React Re-renders in High Frequency Components
**Learning:** Hooks like `usePlaybackTime` that trigger React state updates (via `useSyncExternalStore`) cause full component re-renders at 60fps. Even for small components like `TimeDisplay`, this adds unnecessary overhead to the main thread.
**Action:** For high-frequency updates (playback time, meters, playheads), bypass React render cycle by using `usePlaybackCallback` (or `requestAnimationFrame`) and directly manipulating the DOM via `ref`.
