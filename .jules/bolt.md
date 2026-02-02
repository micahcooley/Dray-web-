## 2026-02-02 - High-Frequency UI Optimization
**Learning:** React state updates at 60fps (via `useSyncExternalStore` or `setState`) cause significant main thread overhead due to reconciliation, even for small components like `TimeDisplay`.
**Action:** For high-frequency updates (playheads, timers, meters), bypass React completely. Use `useRef` and a subscription callback (like `usePlaybackCallback`) to update the DOM directly (`ref.current.textContent` or `style.transform`). This decouples the UI update rate from React's render cycle.
