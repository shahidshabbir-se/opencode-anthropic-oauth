# Support OpenCode V1 and V2

## Objective and scope

Support OpenCode V1 >= 1.18.29 and V2 from one package, with thin host-specific adapters and shared OAuth and request/response utilities. The existing V1-only plugin cannot load through the V2 plugin API.

User authorized local development and selected V1 >= 1.18.29 as the minimum legacy version. Remote publishing, real-account authentication, credential inspection, and global configuration changes are not authorized.

## Constraints and acceptance

- One default export provides V1 `server()` and V2 `setup()` with a stable plugin ID.
- Preserve API-key passthrough and existing OAuth functionality without duplicating shared protocol logic.
- Register V2 OAuth authorization and refresh through integration methods; resolve the selected host account.
- Preserve request headers, tool mapping, streaming responses, cancellation, and cleanup through the appropriate host APIs.
- Validate request credential boundaries; stop for a decision before changing implicit Claude CLI credential selection or custom endpoint policy.
- Pin and document the V2 release against which package types and runtime behavior are verified; never claim untested version ranges.
- Do not claim Anthropic service compatibility from mocked tests or compilation alone.
- No raw tokens, credentials, or user account data in fixtures or reports.

## Tasks

- [x] T1 — Establish offline V1/OAuth regression tests with synthetic credentials and a deterministic runner. Add the runner and development documentation together. Route: delegated; preparation reading and multiple non-trivial files trigger delegation.
- [ ] T2 — Implement dual entrypoint and V2 integration with shared protocol helpers, regression tests, and installation documentation. Route: delegated; multiple non-trivial source/test files trigger delegation. Keep the smallest coherent behavior rather than splitting by file type.
- [ ] T3 — Independently verify package artifacts and both host adapter contracts; document exact results, unsupported cases, and any pending runtime smoke tests. Route: delegated; independent verification and package-level command execution.

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
- Independent verifier: `npm test` and `git diff --check` exited 0; no blocking findings. Final staged whitespace check pending before commit.
- Installation used the public registry without lifecycle scripts or ambient npm credentials. Initial duplicate-NUL config attempt failed; retry using separate empty configs succeeded. This resolved incident does not establish compatibility with other runtimes.
- Fixture replaces fetch, credential-home lookup, filesystem credential reads, scheduling and time before runtime import. Other filesystem paths are not globally sandboxed.
- Assessment: high/unassessable due to undeclared untracked files. RDD remains off; independent verification performed, no review lifecycle started.
- Production source and lockfile unchanged. Coverage gaps: V2, installed package/host, stream cancellation, Request-only bodies, real-account/Anthropic behavior. Characterization is not migration RED/GREEN evidence.
- Rollback: remove the test script, development documentation, and new tests together; production behavior is unaffected.
- Slice 1: regression baseline. Writer reports 439 authored additions before the feature document. Keep cohesive isolation/coverage; recommend size exception if this slice is later proposed as an oversized PR, not cosmetic compression.
- Work-unit commit and exact staged count: pending below.

Resume: local task document contains verified T1 results newer than the Engram mirror; local observed results take precedence and the mirror will be resynchronized. Installed host reports OpenCode 2.0.22, which is the V2 target. Registry `.atl/skill-registry.md` appeared after the interrupted turn and remains outside the implementation candidate. T1 commit attempt did not execute; HEAD remains `031d0a9`.

Engram recovery topic: `odd/opencode-v1-v2-compat/tasks`; mirror must be saved and read back after each progress update. If either operation fails, report the mirror as pending.

Next: record T1 commit and settle any necessary credential-boundary decisions before T2. Remaining product uncertainties are selected-account policy and custom endpoints; investigate their impact before T2 and ask only if a behavior decision is necessary.
