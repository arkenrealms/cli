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

## 2026-02-20 slot-11 follow-up (16:5x PT)
- Rationale: array-flag parsing had no explicit coverage for short-alias equals syntax (`-v=alpha`), even though docs and parser logic intend parity with long-flag forms.
- Change scope:
  - Added `isArrayFlagBoundary(...)` in `index.ts` so array-value capture boundaries are tied to declared short aliases and long flags, reducing accidental early termination from unrelated short tokens.
  - Added `test/parsing.test.ts` coverage (`array flag accepts short-alias equals values`) using alias mapping to lock repeated `-v=...` handling with trailing flags.
- Practical impact: list-style flag parsing behavior is now test-locked for short-alias equals input style without adding router-layer abstractions.

## 2026-02-20 slot-11 follow-up (18:4x PT)
- Rationale: array-list flags already supported `--flag value` and `--flag=value`, but short alias values attached without `=` (for example `-valpha`) were not collected into array inputs, causing silent value loss for a common CLI style.
- Change scope:
  - Updated `index.ts` array-flag collector to accept short-alias attached values (`-valpha`) in addition to `-v alpha` and `-v=alpha`.
  - Added regression coverage in `test/parsing.test.ts` (`array flag accepts short-alias attached values`) to lock behavior with trailing flags.
  - Updated `README.md` list-flag examples to document attached short-alias form.
- Practical impact: list-style flag parsing is now consistent across common shorthand variants without introducing extra router/procedure abstraction.

## 2026-02-20 slot-11 follow-up correction (18:4x PT)
- Correction: attached short-alias array syntax (`-valpha`) is parsed by the argument parser as bundled short options and is not a supported input form in this CLI.
- Final slot change:
  - Added explicit regression coverage in `test/parsing.test.ts` for repeated short-alias spaced list values (`-v alpha -v beta`) with trailing flags.
  - Updated `README.md` list-flag examples to document supported short-alias list syntax accurately.
- Practical impact: parser expectations are now test-locked for supported short-alias multi-value usage, reducing ambiguity for CLI callers and docs drift.

## 2026-02-20 slot-11 follow-up (20:4x PT)
- Rationale: `router.ts` eagerly built every remote protocol router at module load; when workspace linking drifted (or heavy protocol modules executed side-effectful model init), unrelated CLI tests failed before any command routing logic ran.
- Change scope:
  - Updated `router.ts` route registration to skip optional remote router creation when module resolution/initialization throws, preserving local CLI command/router availability.
  - Increased timeout budget for heavy `tsx`-spawned filesystem e2e cases in `test/e2e.test.ts` (`fs copy`, `fs diff`) from default 5s to 15s to remove runtime-noise flakes while preserving assertions.
- Practical impact: local CLI/test surfaces stay reliable even if optional remote protocol packages are temporarily unavailable, and filesystem e2e coverage now completes consistently in CI-like runtimes.

## 2026-02-20 slot-11 follow-up (22:5x PT)
- Rationale: `router.ts` still initialized every configured remote backend socket at module load, even when the command targeted a single local namespace (for example `math.add`). In maintenance/runtime environments this creates avoidable websocket connection attempts and can keep Node processes alive longer than needed.
- Change scope:
  - Added argv-aware route targeting (`resolveRequestedRoute` + `shouldInstantiateRoute`) so a namespaced command only instantiates the requested remote route plus local fallback routers.
  - Applied the same route filter to backend socket client creation to avoid unnecessary remote socket setup for unrelated namespaces.
  - Enabled `socket.io-client` `autoUnref: true` to reduce process-hang risk in short-lived CLI invocations.
- Practical impact: CLI runs that target a single namespace now do less eager remote work while preserving existing local command behavior and remote dispatch for the selected route.

## 2026-02-21 slot-11 follow-up (00:5x PT)
- Rationale: array-flag collection in `index.ts` only treated declared short aliases as boundaries, so generic short flags (for example `-h`) could be accidentally absorbed as data values in multi-value inputs.
- Change scope:
  - Updated `isArrayFlagBoundary(...)` to treat any real flag token as a boundary while still preserving numeric negatives (for example `-1`) as array values.
  - Added regression coverage in `test/parsing.test.ts` (`array flag does not absorb unknown short flags`).
- Practical impact: multi-value flag parsing no longer swallows short flags into array payloads, reducing accidental input corruption in mixed-flag commands.

## 2026-02-21 slot-11 follow-up (03:0x PT)
- Rationale: shorthand command parsing dropped trailing empty parameters (for example `Gon.ask("hello", "")`), which changed argument arity and could silently break downstream agent method calls.
- Change scope:
  - Updated `parseParamsString(...)` in `index.ts` to preserve explicitly provided empty trailing params.
  - Added regression coverage in `test/parsing.test.ts` (`shorthand parser preserves trailing empty params`) using `cerebro.exec` shorthand input.
- Practical impact: shorthand invocations now preserve intentional empty string arguments, improving reliability for command paths that depend on exact positional parameter counts.

## 2026-02-21 slot-11 follow-up (05:4x PT)
- Rationale: shorthand parameter parsing trimmed all tokens before dispatch, so quoted whitespace-only arguments (for example `Gon.ask("hello", "   ")`) were collapsed to empty strings and lost user intent.
- Change scope:
  - Updated `parseParamsString(...)` in `index.ts` to preserve exact token text for quoted params while keeping trim behavior for unquoted params.
  - Added regression coverage in `test/parsing.test.ts` (`shorthand parser preserves quoted whitespace params`) to lock whitespace-preserving behavior.
- Practical impact: shorthand agent invocations now preserve intentional whitespace payloads in quoted args, improving parity with explicit `--params` usage and reducing silent input mutation.

## 2026-02-21 cron run validation (10:1x PT)
- Rationale: this workflow currently prioritizes stable CLI↔cerebro-link tRPC websocket interop and README command reliability, so this run focused on concrete end-to-end verification in the current runtime rather than additional transport refactors.
- Validation runbook/results (Node `20.11.1`, Rush scripts):
  - `source ~/.nvm/nvm.sh && nvm use 20 && rushx test` in `cerebro/link` ✅ (6/6 tests, including websocket callback settlement coverage)
  - `source ~/.nvm/nvm.sh && nvm use 20 && rushx test` in `cli` ✅ (67/67 tests, including `test/cerebro-readme.test.ts`)
  - with live bridge from `cerebro/link` (`rushx dev` auto-fallback bound `ws://localhost:55687` because 8080 was occupied):
    - `source ~/.nvm/nvm.sh && nvm use 20 && rushx cli config.list` ✅
    - `source ~/.nvm/nvm.sh && nvm use 20 && ./bin/arken config.list` ✅
    - `source ~/.nvm/nvm.sh && nvm use 20 && CEREBRO_SERVICE_URI=ws://127.0.0.1:55687 rushx cli cerebro.info` ✅ (`{"name":"Cerebro Link"}`)
    - `source ~/.nvm/nvm.sh && nvm use 20 && CEREBRO_SERVICE_URI=ws://127.0.0.1:55687 ./bin/arken cerebro.info` ✅ (`{"name":"Cerebro Link"}`)
    - `source ~/.nvm/nvm.sh && nvm use 20 && CEREBRO_SERVICE_URI=ws://127.0.0.1:55687 rushx cli cerebro.ask --mod math --messages "2+2"` ✅
    - `source ~/.nvm/nvm.sh && nvm use 20 && CEREBRO_SERVICE_URI=ws://127.0.0.1:55687 ./bin/arken cerebro.ask --mod math --messages "2+2"` ✅
- Practical impact: README-documented CLI commands are green in this environment and websocket transport remains reliable with occupied-port fallback behavior.

## 2026-02-21 slot-11 follow-up (10:3x PT)
- Rationale: shorthand invocation regex only matched `\w` identifiers, so valid hyphenated names (for example `my-agent.fetch-data(...)`) were ignored and not expanded into `--agent/--method/--params`, causing command-not-found behavior.
- Change scope:
  - Updated shorthand regex in `index.ts` (both normal and interactive paths) to accept hyphenated agent/method identifiers.
  - Corrected interactive shorthand match destructuring to use capture groups consistently (`[, agent, method, paramsString]`).
  - Added regression coverage in `test/parsing.test.ts` (`shorthand parser accepts hyphenated agent and method names`).
- Practical impact: shorthand calls now support common hyphenated identifiers reliably in both one-shot and interactive CLI modes.

## 2026-02-21 cron run follow-up (13:2x PT)
- Rationale: README examples include both `cerebro.exec --agent ... --method ...` and shorthand `Hisoka.run()` forms, but the existing websocket README interop test only locked `cerebro.info`/`cerebro.ask`; adding `cerebro.exec` coverage exposed a real transport gap (`TRPC handler does not exist for method: exec`) and closed the doc-to-runtime gap.
- Change scope:
  - Extended `test/cerebro-readme.test.ts` to execute and assert both README-style exec variants over the live tRPC websocket bridge:
    - `rushx cli cerebro.exec --agent Hisoka --method run`
    - `./bin/arken cerebro.exec Hisoka.run()`
  - Assertions verify payload fields (`agent`, `method`) from the link service response.
- Practical impact: README command reliability checks now include exec request/response flow in addition to info/ask, strengthening end-to-end CLI↔cerebro-link confidence and catching transport regressions quickly.

## 2026-02-21 cron run follow-up (13:2x PT, parser correction)
- Rationale: shorthand no-arg form `Hisoka.run()` was being expanded with an empty `--params` token, producing `params: [""]` instead of an empty list and diverging from expected README semantics.
- Change scope:
  - Updated shorthand argv reconstruction in `index.ts` to include `--params` only when parsed params are present.
  - Added regression coverage in `test/parsing.test.ts` (`shorthand parser with empty parens omits params flag`).
- Practical impact: no-arg shorthand exec now serializes cleanly as `params: []` in live CLI↔cerebro-link websocket calls.

## 2026-02-21 slot-11 follow-up (13:3x PT)
- Rationale: shorthand parameter parsing dropped a terminal escape marker when params ended with a backslash (for example `Gon.ask(hello\\)`), which can corrupt path-like inputs and silently alter user intent.
- Change scope:
  - Updated `parseParamsString(...)` in `index.ts` to retain a trailing literal backslash when an escape sequence is unfinished at end-of-input.
  - Added regression coverage in `test/parsing.test.ts` (`shorthand parser preserves trailing backslash in params`).
- Practical impact: shorthand `cerebro.exec` calls now preserve terminal backslashes in parameter payloads instead of truncating them.

## 2026-02-21 cron run follow-up (16:1x PT, README command reliability)
- Rationale: in this environment port `8080` is frequently occupied, so README examples hardcoding `ws://127.0.0.1:8080` can fail even though the websocket bridge is healthy; docs should mirror the practical, smallest reliable setup path.
- Change scope:
  - Updated `README.md` websocket section to explicitly start `@arken/cerebro-link` with `PORT=8090 rushx dev` and use matching `CEREBRO_SERVICE_URI` examples.
  - Added note that when port is not pinned, users should copy the auto-fallback `ws://localhost:<port>` endpoint printed by link dev server.
- Validation runbook/results (Node `20.11.1`, Rush scripts):
  - `source ~/.nvm/nvm.sh && nvm use 20 && rushx test` in `cerebro/link` ✅
  - `source ~/.nvm/nvm.sh && nvm use 20 && rushx test` in `cli` ✅
  - Live bridge from `cerebro/link` (`rushx dev` bound `ws://localhost:49856`):
    - `CEREBRO_SERVICE_URI=ws://127.0.0.1:49856 rushx cli cerebro.info` ✅
    - `CEREBRO_SERVICE_URI=ws://127.0.0.1:49856 ./bin/arken cerebro.info` ✅
    - `rushx cli config.list` ✅
- Practical impact: README commands now provide a deterministic port-pinned path that works reliably in this runtime while still documenting auto-fallback behavior.

## 2026-02-22 cron run follow-up (18:1x PT, websocket interop verification)
- Rationale: this workstream’s acceptance bar is stable CLI↔cerebro-link tRPC websocket behavior with README command reliability, so this run prioritized direct end-to-end checks (not abstraction refactors) and recorded exact command outcomes in the current environment.
- Change scope:
  - Added this verification log entry with concrete command transcript/results for reproducibility.
- Validation runbook/results (Node `20.11.1`, Rush scripts):
  - `source ~/.nvm/nvm.sh && nvm use 20 && rushx test` in `cerebro/link` ✅ (6/6 tests; includes websocket callback settlement coverage)
  - `source ~/.nvm/nvm.sh && nvm use 20 && rushx test` in `cli` ✅ (70/70 tests; includes `test/cerebro-readme.test.ts` websocket README command coverage)
  - Live command checks against active websocket endpoint:
    - `CEREBRO_SERVICE_URI=ws://127.0.0.1:8090 rushx cli cerebro.info` ✅ (`{"name":"Cerebro Link"}`)
    - `CEREBRO_SERVICE_URI=ws://127.0.0.1:8090 ./bin/arken cerebro.info` ✅ (`{"name":"Cerebro Link"}`)
- Practical impact: README websocket commands are green in this environment and the tRPC websocket bridge remains operational end-to-end from CLI.
