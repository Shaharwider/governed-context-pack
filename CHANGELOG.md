# Changelog

All notable changes to the context-pack specification are recorded here. The
spec is versioned semver-style per §6: pre-1.0, breaking changes to §2–§4 bump
the minor version; after 1.0 they bump the major version. Schemas and the
`@datacircles/context-pack` npm package track the same version.

## v0.2.1 — 2026-09-23

Reference-implementation parity fixes found in review the same day; no
change to the request or response contract.

### Changed

- `objects.roles` now carries `minItems: 1` in the JSON Schema — "circles
  carrying at least one listed role" cannot be an empty list.
- The reference implementation now accepts every §5 payload the schema
  accepts (absent `objects`, integer `sensitivity_max`, `rationale`,
  `version`), rejects unknown rule/subject keys as §2 requires, and keeps
  an `expired` policy enforced until a human resolves it (§5.3 rule 2).

## v0.2.0 — 2026-09-23

First public release. Draft for review; nothing here is frozen yet. Supersedes
the assembled-but-unpublished 0.1.0 below.

### Changed

- **Circles are org-defined, not a fixed set of nine rings** (§1). A circle is
  `(scope, slug)` with an unbounded non-negative **authority** (0 = centre;
  lower wins conflicts) and optional **roles** (open vocabulary such as
  `mission`, `glossary`, `working`). Providers MUST preserve the ordering
  semantics and MUST NOT attach fixed meanings to particular numbers.
- `mission_slice` and `definitions` are defined by circle **role**, not by
  ring number (§3.1, §3.3); `entities` resolve against glossary-role circles
  (§2); a workspace is a `working`-role circle (§1).
- **Knowledge items** name the `circle` (path) they came from and that circle's
  `authority`, replacing the 0–8 `ring` field (§3.5).
- **§5 rewritten** for a cold reader: grants give, policies subtract; the
  four questions a policy answers; `objects` gains the `authority_min`,
  `authority_max` and `roles` selectors so templates survive an org adding
  circles; `conditions` belong on `allow_up_to` rules (a `deny` with
  conditions SHOULD be rejected). The intern example no longer carries
  conditions on a denial; a second, role-based example is added.
- `pack_version` in the worked response is `"0.2"`;
  `@datacircles/context-pack` is `0.2.0` with `SPEC_VERSION = "0.2"`.

### Added

- `examples/policy-contractor-working-memory.json` — an `allow_up_to` ceiling
  by role with a `task_scoped` condition.

## v0.1.0 — 2026-09-20

Assembled for review; never published (superseded by 0.2.0 before its first
release). Kept for the record.

### Added

- **SPEC.md v0.1** — terminology (§1), the request contract (§2), the
  eight-section response with order-as-precedence (§3), behavioral rules (§4:
  permission scoping, pack persistence & identity, provenance, freshness
  semantics, membranes narrow, budget degradation, workspaces), the guardrail
  policy payload (§5), versioning & conformance (§6).
- **JSON Schemas** (draft-2020-12): `schema/pack-request.schema.json`,
  `schema/pack-response.schema.json`, `schema/guardrail-policy.schema.json`.
- **Worked examples**: `examples/request-deploy-task.json` and
  `examples/response-deploy-task.json` — an agent preparing a production
  deploy, where the declared `write` verb produces a binding deploy-freeze
  constraint, one governing decision is flagged `expiring`, and
  `pack_meta.gaps` reports a missing rollback runbook — plus
  `examples/policy-intern-no-write.json`, the §5 guardrail policy payload.
- **`@datacircles/context-pack` 0.1.0** on npm — Zod validators and TypeScript
  types. The Zod schemas are the source of truth; the JSON Schemas in this repo
  are generated from them and CI fails on drift.
- **CI**: every example is validated against its schema on every push.
