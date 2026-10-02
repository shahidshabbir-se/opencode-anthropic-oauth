# Support OpenCode V1 and V2

## Objective and scope

Support OpenCode V1 >= 1.18.29 and V2 from one package, with thin host-specific adapters and shared OAuth and request/response utilities. The existing V1-only plugin cannot load through the V2 plugin API.

User authorized local development and selected V1 >= 1.18.29 as the minimum legacy version. Remote publishing, real-account authentication, credential inspection, and global configuration changes are not authorized.

## Constraints and acceptance

- One default export provides V1 `server()` and V2 `setup()` with a stable plugin ID.
- Preserve API-key passthrough and existing OAuth functionality without duplicating shared protocol logic.
- Register V2 OAuth authorization and refresh through integration methods; resolve the selected host account.
- Preserve request headers, tool mapping, streaming responses, cancellation, and cleanup through the appropriate host APIs.
- Preserve the existing custom-endpoint forwarding policy: the user explicitly deferred origin restrictions after the risk explanation. No trusted-origin allowlist or new endpoint opt-in is in scope. Keep credential handling scoped to the Anthropic OAuth flow and do not introduce unrelated credential readers.
- Pin and document the V2 release against which package types and runtime behavior are verified; never claim untested version ranges.
- Do not claim Anthropic service compatibility from mocked tests or compilation alone.
- No raw tokens, credentials, or user account data in fixtures or reports.

## Tasks

- [x] T1 — Establish offline V1/OAuth regression tests with synthetic credentials and a deterministic runner. Add the runner and development documentation together. Route: delegated; preparation reading and multiple non-trivial files trigger delegation.
- [x] T2 — Implement dual entrypoint and V2 integration with shared protocol helpers, regression tests, and installation documentation. Route: delegated; multiple non-trivial source/test files trigger delegation. Keep the smallest coherent behavior rather than splitting by file type.
- [x] T3 — Independently verify package artifacts and both host adapter contracts; document exact results, unsupported cases, and any pending runtime smoke tests. Route: delegated; independent verification and package-level command execution. Offline/package verification complete; actual host/login smoke remains explicitly pending.

## Verification policy

Configured TDD mode: unknown; no project setting or test runner found during exploration. Apply the default deterministic test-first policy: observe a failing compatibility test before implementing its behavior, then GREEN and refactor. Characterization tests may already pass; that is not RED evidence.

Runner: Node's built-in test runner; `npm test` runs `npm run build && node --test tests/*.test.mjs`. Tests use mocked HTTP/context and synthetic credentials. Baseline build command: `npm run build`. Package verification must inspect the installed/package artifact rather than claiming a workspace-only test proves host loading. Do not run login or read ambient credential files.

RDD: was globally off during T1 implementation/verification; on resume it is globally on (read-only mode status). Follow the native committed-candidate assessment and consent without changing the user's switch. Parent reruns one reported check before delivery.

## Delivery and recovery

Branch: `feat/opencode-v1-v2-compat`. Base / initial reviewed boundary: `031d0a9`.

Forecast: approximately 600–1,000 authored additions plus deletions, excluding generated files; advisory estimate based on the existing 438-line adapter and missing tests. Never omit tests or compress code to fit a line target.

Delivery strategy: `ask-on-risk`. User selected `feature-branch-chain`: keep dependent slices isolated until the complete migration is ready. Proposed coherent slices: offline regression baseline, then dual-host compatibility with its tests/docs. No PR creation, push, or merge authorized.

Each completed implementation work unit receives a Conventional Commit on the feature branch, without AI attribution. Record exact commit IDs, authored line counts, rollback boundaries, checks, and slice assignments here. Mark tasks complete only after observed outcomes.

## Progress and next step

Exploration complete; working tree was clean on `master` before creating the feature branch. CodeGraph unavailable because its executable is missing.

T1 evidence:
- Writer: `npm run build`, `npm test`, and `git diff --check` exited 0; 20 tests passed (6 OAuth, 14 V1).
- Parent spot check: `npm test` exited 0; 20/20 passed on Node 26.9.0 / npm 11.19.1.
- Independent verifier: `npm test` and `git diff --check` exited 0; no blocking findings. Final staged `git diff --cached --check` exited 0 before commit.
- Installation used the public registry without lifecycle scripts or ambient npm credentials. Initial duplicate-NUL config attempt failed; retry using separate empty configs succeeded. This resolved incident does not establish compatibility with other runtimes.
- Fixture replaces fetch, credential-home lookup, filesystem credential reads, scheduling and time before runtime import. Other filesystem paths are not globally sandboxed.
- Assessment: high/unassessable due to undeclared untracked files. RDD remains off; independent verification performed, no review lifecycle started.
- Production source and lockfile unchanged. Coverage gaps: V2, installed package/host, stream cancellation, Request-only bodies, real-account/Anthropic behavior. Characterization is not migration RED/GREEN evidence.
- Rollback: remove the test script, development documentation, and new tests together; production behavior is unaffected.
- Slice 1: regression baseline. Writer reports 439 authored additions before the feature document. Keep cohesive isolation/coverage; recommend size exception if this slice is later proposed as an oversized PR, not cosmetic compression.
- Work-unit commit: `807e1a6ffa974198b3c95e93a721a0a5be96b669`; 503 authored additions including the feature document, 0 deletions. Slice 1 boundary is this commit.

Resume: local task document contains verified T1 results newer than the Engram mirror; local observed results take precedence and the mirror will be resynchronized. Installed host reports OpenCode 2.0.22, which is the V2 target. Registry `.atl/skill-registry.md` appeared after the interrupted turn and remains outside the implementation candidate. Interrupted T1 commit attempt did not execute; retry produced `807e1a6`.

T1 native assessment: excluding the known auxiliary registry inventory yields medium risk (`configuration_change`, package.json), review due (`slice_budget_reached`). Exact returned preflight currently requests the documented external untracked-selection input before START. No review has started or approved; schema inspection is pending and the unchanged committed T1 candidate remains isolated from T2 working edits.

Engram recovery topic: `odd/opencode-v1-v2-compat/tasks`; mirror must be saved and read back after each progress update. If either operation fails, report the mirror as pending.

T2 origin-policy blocker resolved by explicit user direction: preserve the existing behavior and focus on V1/V2 compatibility. Existing V1 forwards OAuth bearer tokens to the caller-selected URL (src/index.ts:345,353,387); V2 supports custom Anthropic baseURL settings with the same integration connection. The user understood the risk and declined the proposed restriction. Origin hardening is deferred, not implemented or claimed fixed.

T2 exploration/checks: official V2 guides and tagged 2.0.22 declarations/source inspected. Host integration resolution owns OAuth refresh/persistence. Worker ran `npm run build`, `npm test` (20/20), `git diff --check`, and `npm pack --dry-run --json --ignore-scripts` successfully against the unchanged baseline. No T2 RED/GREEN or source changes; no real credentials/login, installation, or native lifecycle operations. V1 CLI preference untouched. Runtime and installed-package migration checks remain pending.

Next: implement T2 against OpenCode 2.0.22 while preserving V1 >= 1.18.29 and existing endpoint behavior. Reconcile the exact committed T1 native preflight independently; never claim an acknowledgement without its envelope.

## T2 implementation and T3 verification evidence

- Dual default object exposes stable plugin ID, V1 `server()` and V2 `setup()`. Both SDK imports are type-only and both peers optional; target V2 declarations are exactly 2.0.22.
- Shared transport utilities preserve header/cache metadata, body/system/tool transformations and fragmented UTF-8/SSE. Existing custom endpoint behavior is unchanged; no origin hardening implemented.
- V1 retains CLI preference and OAuth fallback/retries, now with instance-owned credential cache and timer disposal. V2 uses native selected accounts and refresh/persistence/retries; no V2 implicit CLI credential reader.
- V2 OAuth-only hooks match the account bearer and preserve API-key passthrough, Request-only bodies, signals, cancellation/unload and dispatched-request response correlation across account switches. Account events refresh model pricing.
- Writer observed deterministic RED: 28 tests, 20 passed / 8 failed for missing dual/V2 APIs; then 28/28 GREEN. Additional unload, response-abort and pending-body cancellation tests observed RED before fixes; final 34/34 GREEN. A Windows package-fixture quoting failure was corrected, not treated as behavior proof.
- Writer final foreground checks after all normalization: `npm run build`, `npm test` (34/34), `git diff --check`, `npm pack --dry-run --json --ignore-scripts` (13 entries), all exit 0. No source mutation followed those checks.
- Parent spot check: `npm test` exit 0, 34 passed / 0 failed.
- Independent T3 verifier reran all four commands: exit 0, 34/34 tests, 13 pack entries, no substantiated candidate defect. Pack test extracts an actual tarball and imports by bare package name without either host SDK, exercising mocked `server()` and `setup()`.
- Lock root synchronized at 0.4.6; 283 added dependency entries all reachable from the V2 SDK development dependency/optional/peer closure with integrity values. No pre-existing non-root lock entry changed; generated lock growth is excluded from authored budget.
- Runtime observed for checks: Node 26.9.0 / npm 11.19.1. Standard Fetch APIs and AbortSignal.any required by V2 adapter; package-artifact test also requires npm and tar.
- Authored estimate excluding generated lock and parent document: 1,444 additions plus deletions including V1 relocation. Keep cohesive code/test/doc slice; recommend a size exception or dependency-aware review slices if a PR is later requested. No PR/publication authorized.
- Rollback T2: revert dual adapter/shared transport, associated package dependencies, tests and install docs together to restore the T1 baseline; do not independently drop only the V2 helper while keeping its entrypoint.
- Pending (not passed): actual V1/V2 host activation/reload, native account refresh/persistence/retry and request identity end-to-end, real login and Anthropic service compatibility. These require isolated host validation and separately authorized real-account testing.
- Native review is not approved: preflight requests an external untracked-selection contract unavailable to the current transport. Retain the exact pending evidence; do not invent a selection schema, approval or acknowledgement, and do not disable RDD automatically.
- T2/T3 work-unit commit: pending final staged whitespace check and commit; record exact identity afterward.

Next action: save the verified work unit, then report the implemented/offline-verified compatibility and pending native/live-host checks without claiming end-to-end success.
