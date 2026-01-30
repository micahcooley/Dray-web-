## 2024-05-23 - Environment Dependencies Missing
**Learning:** The sandbox environment may have missing `node_modules` binaries (including `next`, `tsc`, `eslint`, `jest`), preventing standard verification commands like `npm run build` or `npm test` from running.
**Action:** When verification commands fail due to missing binaries, rely on strict manual code inspection and verifying import paths/logic against source files. Do not attempt to reinstall dependencies unless explicitly instructed, to avoid changing the environment.
