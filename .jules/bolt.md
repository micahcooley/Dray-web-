## 2024-05-23 - [Canvas Optimization Batching]
**Learning:** Canvas `stroke()` calls inside loops are expensive. Batching them into a single path significantly reduces draw calls, especially for 60fps animations.
**Action:** Always look for `ctx.stroke()` or `ctx.fill()` inside loops and try to batch them.

## 2024-05-23 - [Cleanup Artifacts]
**Learning:** Running `npm install` can noisily modify `package-lock.json`. Local logs like `server.log` must be cleaned up.
**Action:** Always run `git status` or restore lockfiles before submitting.
