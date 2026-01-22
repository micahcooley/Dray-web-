# BOLT'S JOURNAL - CRITICAL LEARNINGS ONLY

## 2024-05-22 - [TimeDisplay Re-renders]
**Learning:** React components using `useSyncExternalStore` for high-frequency updates (60fps) cause significant overhead due to React reconciliation, even if the DOM update is small.
**Action:** Use direct DOM manipulation via `ref` and a subscription callback (bypassing React state) for components that update on every frame, like time displays and playheads.
