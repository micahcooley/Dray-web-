## 2025-02-18 - Optimized Piano Roll Scroll Sync
**Learning:** Found redundant scroll event listeners (one in `useEffect`, one in `onScroll`) and inefficient `document.querySelector` usage inside the scroll handler.
**Action:** Always prefer `useRef` for direct DOM access in high-frequency event handlers like scroll or mousemove. Check for duplicate event handling when refactoring legacy components.
