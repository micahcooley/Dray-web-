## 2024-05-23 - [React Re-render Bottleneck in TimeDisplay]
**Learning:** The `usePlaybackTime` hook triggers a React re-render on every scheduler update (approx 60fps), which is expensive for simple text updates. Components like `TimeDisplay` were unnecessarily reconciling the Virtual DOM every frame.
**Action:** Prefer `usePlaybackCallback` for high-frequency updates (like timers and playheads) and use direct DOM manipulation (via `ref.textContent` or `ref.style.transform`) to bypass React's render cycle.
