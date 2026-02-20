# arken/packages/cli/ANALYSIS.md

## Snapshot (2026-02-18)
- Target role: executable CLI wrapper over Arken routers/modules.
- Current local test gate status is blocked in this checkout/runtime:
  - `rushx test` fails because Rush workspace expects missing package `@arken/cerebro-hub`.
  - `npm test` fails because local `vitest` binary is unavailable.

## Safe next step
- Restore a runnable repo-defined test command in this checkout (either Rush workspace integrity or local dependency install).
- After test command is runnable, proceed with source-level reliability fixes and validate with passing test output in the same run.

## 2026-02-18 late-night slot-12 verification
- Re-ran branch hygiene (`git fetch origin` + merge `origin/main`) and loaded local markdown before source review (`README.md`, this file).
- Deepest-first source skim prioritized `test/*` and module routers/CLIs (`modules/*/*.cli.ts`, `router.ts`, `trpc-compat.ts`).
- Current test commands in this checkout:
  - `npm test -- --runInBand` ❌ `vitest: command not found`
  - `rushx test` ❌ Rush workspace package-map drift (`@arken/cerebro-hub` expected at `arken/cerebro/hub/package.json`).
- No source edits were made under the source-change test gate.

## 2026-02-19 slot-12 follow-up
- Re-ran branch hygiene (`git fetch origin` + merge `origin/main`) before any change.
- Reconfirmed test gate is still blocked in this checkout:
  - `npm test -- --runInBand` fails with `vitest: command not found`.
  - `npm run test:jest -- --runInBand` fails with `jest: command not found`.
- Left source untouched to satisfy source-change policy.
- Next actionable unblock: install package dependencies in a workspace-valid way (`rush update` from repo root) so either test script becomes runnable before source edits.

## 2026-02-19 slot-12 follow-up (02:12 PT)
- Re-ran mandatory branch hygiene before any edit: `git fetch origin && git merge --no-edit origin/main` (`Already up to date`).
- Re-loaded local markdown context (`README.md`, `ANALYSIS.md`) before source/test review.
- Revalidated local test gate:
  - `rushx test` ❌ `vitest: command not found`
  - `npm test -- --runInBand` ❌ `vitest: command not found`
- Left source files unchanged to preserve source-change gate compliance.
- Next unblock step remains restoring a runnable repo-defined test command for this package in the current workspace runtime.

## 2026-02-20 slot-11 follow-up (04:16 PT)
- Reran required branch hygiene before attempting edits: `git fetch origin && git merge --no-edit origin/main` (clean on `origin/main` baseline).
- Revalidated the repo-defined test command on Node `20.11.1`:
  - `rushx test` ❌ fails immediately because tests import removed legacy paths (`../src`, `../src/router`, `../src/logging`, `../src/zod-procedure`).
- Rationale for no source edits this slot: source-change gate requires passing validation in-run, but test harness currently fails before executing any assertions due broken import paths.
- Next actionable unblock: migrate test imports/fixtures off `src/*` aliases to current flat layout (or add compatibility re-export shims) in one focused patch, then rerun `rushx test`.

## 2026-02-20 websocket integration follow-up (06:22 PT)
- Updated CLI runtime output handling in `index.ts` to log non-undefined procedure results (`logger.info`) so README examples now return visible output again (for example `rushx cli math.add 1 1` returns `2`).
- Verified direct CLI↔cerebro-link websocket flow with a live local server (`PORT=8081 rushx dev` in `cerebro/link` + `CEREBRO_SERVICE_URI=ws://127.0.0.1:8081 rushx cli cerebro.info` in `cli`) and confirmed expected payload output (`{"name":"Cerebro Link"}`).
- Kept README command docs aligned with this checkout (`rushx cli ...` and `./bin/arken ...`; module paths under `modules/*`) so documented commands are executable as written.

## 2026-02-20 slot-11 follow-up (08:32 PT)
- Rationale: while validating the now-runnable `rushx test` gate, the CLI error path still emitted a stray debug line (`throwing error`) when `--verboseErrors` was used. That extra stdout noise can pollute automation and makes verbose mode less reliable.
- Change scope:
  - Removed the debug `console.log('throwing error')` side-effect from the verbose `die(...)` path in `index.ts`.
  - Added `test/verbose-errors.test.ts` to lock expected behavior: verbose errors should throw, avoid forced process exit, and avoid debug-noise stdout.
- This keeps behavior practical (no extra abstraction), aligns with reliability-first maintenance, and preserves explicit throw semantics in verbose mode.

## 2026-02-20 slot-11 follow-up (10:4x PT)
- Rationale: array-valued flags in `executeCommand(...)` treated any token beginning with `-` as a new flag, so negative numeric values (for example `--values -1 -2`) were incorrectly dropped or misparsed.
- Change scope:
  - Added `isFlagToken(...)` in `index.ts` so only real flags terminate array-flag collection; hyphen-prefixed values like `-1`, `-2`, and `-1e3` are no longer misclassified as new flags.
  - Added `test/parsing.test.ts` coverage (`array flag accepts hyphen-prefixed values`) to enforce parsing with trailing flags in the same invocation.
- This is a direct reliability fix (no router abstraction churn) and keeps CLI argument parsing behavior consistent when list-style flag values include signed/hyphenated tokens.

## 2026-02-20 slot-11 follow-up (12:3x PT)
- Rationale: array-flag parsing treated a lone hyphen (`-`) as a new short flag token, which truncated list capture and could drop valid stdin-style placeholder values.
- Change scope:
  - Updated `isFlagToken(...)` in `index.ts` so a single hyphen is treated as data (not a flag boundary) while preserving existing behavior for `--long` flags and short-flag tokens.
  - Added `test/parsing.test.ts` coverage (`array flag accepts single hyphen value`) to lock end-to-end CLI parsing for `--values - -- literal --tag demo`.
- Practical impact: list-style flags now reliably preserve hyphen sentinel values without introducing router-layer abstraction churn.

## 2026-02-20 slot-11 follow-up (14:5x PT)
- Rationale: list-style flags parsed from raw argv did not honor equals-assigned syntax (`--values=a`), so multi-value inputs could be silently dropped when callers used common CLI style instead of spaced tokens.
- Change scope:
  - Updated `index.ts` array-flag collection to capture both `--flag value` and `--flag=value` (including short-alias `-f=value`) for `multiple` flags.
  - Added `test/parsing.test.ts` coverage (`array flag accepts equals-assigned values`) to lock behavior for repeated `--values=...` inputs with trailing flags.
- Practical impact: array inputs now parse consistently across common flag styles without adding extra abstraction in router/procedure layers.

## 2026-02-20 slot-12 websocket verification (15:1x PT)
- Rationale: this workstream’s acceptance bar is operational reliability (README commands green + CLI↔cerebro-link tRPC websocket path stable), so this slot focused on concrete end-to-end execution checks rather than additional abstraction refactors.
- Validation runbook/results (Node `20.11.1`, Rush scripts):
  - `source ~/.nvm/nvm.sh && nvm use 20 && rushx test` ✅ (all 61 tests passed)
  - `source ~/.nvm/nvm.sh && nvm use 20 && rushx cli config.list` ✅
  - `source ~/.nvm/nvm.sh && nvm use 20 && ./bin/arken config.list` ✅
  - with local bridge (`PORT=8082 rushx dev` in `cerebro/link`):
    - `CEREBRO_SERVICE_URI=ws://127.0.0.1:8082 rushx cli cerebro.info` ✅ (`{"name":"Cerebro Link"}`)
    - `CEREBRO_SERVICE_URI=ws://127.0.0.1:8082 ./bin/arken cerebro.info` ✅ (`{"name":"Cerebro Link"}`)
    - `CEREBRO_SERVICE_URI=ws://127.0.0.1:8082 rushx cli cerebro.ask --mod math --messages 2+2` ✅ (echo payload returned)
- Cross-repo transport checks were also rerun in `cerebro/link` (`rushx test` ✅ including callback settlement coverage) to confirm websocket request/response handling and callback cleanup behavior stay green.
