# Changelog

All notable changes to the Governed Context Pack specification are recorded here.
The spec is versioned semver-style per §6: `pack_version` names a breaking line
(`MAJOR.MINOR`). Before 1.0, breaking changes to §2–§4 bump the minor number;
after 1.0 they bump the major number. Additive changes ship as patch releases
inside the line. Schemas and the `@datacircles/context-pack` npm package track
the same version.

## v0.3.0 — 2026-09-30

Breaking line `"0.3"`. The title is now **Governed Context Pack Specification**.
The public repository is renamed to `governed-context-pack`. 0.2.0 and 0.2.1
were published on 2026-09-23 under the previous name, `context-pack-spec`;
after the rename their schema `$id`s no longer resolve. The git tags remain.

### Changed

- **Verbs are knowledge-store access only.** A verb is an action on knowledge
  held by the provider, never a world action. World rules (a deploy freeze)
  are served as knowledge in `decisions_in_force` or `mission_slice`.
  `binding_constraints` constrain knowledge access.
- **`pack_version` is required** and names the breaking line (`"0.3"`).
  Producers are strict. Consumers ignore unknown fields within a line.
  Requests stay strict. Any object may carry `x-` extension fields.
- **`principal` is an object** `{ id, kind, sponsor? }`, established by
  transport authentication. A provider must not accept a self-declared principal.
  `sponsor` is required when `kind` is `agent` (SPEC §4.8).
- **`conflicts` is required** on every pack (`[]` means none known). Each
  conflict carries a stable `conflict_id` and may carry `detected_at`.
- **Binding constraints** gain `scope` and a structured `applies_because`.
  `conditions` is required exactly when `effect` is `require`, and uses the
  §5 conditions vocabulary.
- **Provenance is required** on `mission_slice` and `definitions` items.
- The worked deploy example follows the rules above.

### Added

- **`pack_meta.digest`** (required): `sha256:` plus the SHA-256 of the RFC 8785
  canonical pack with that field removed. The same `pack_id` returns the same
  digest forever. The digest detects corruption and accidental change. It is
  not a signature.
- **`schema/pack-response.consumer.schema.json`**: the schema a consumer uses
  to validate a pack it received. Unknown fields pass. A different
  `pack_version`, or a new value in a closed set, fails.
- Adding a value to a closed set (verbs, `effect`, `principal.kind`,
  `provenance.method`, `ttl_state`, `freshness`) is a breaking change.
- Providers persist the canonical pack bytes as an audit record. That record
  is not knowledge.
- `@datacircles/context-pack` **0.3.0** — first registry release. Adds
  `parseContextPack`, `computePackDigest`, and `verifyPackDigest`.

### Migration from 0.2

- Set `pack_version` to `"0.3"` and add `digest`.
- Replace a string `principal` with `{ id, kind, sponsor? }`.
- Move world-action rules out of `binding_constraints` into `decisions_in_force`
  or `mission_slice`. Give each remaining constraint a `scope` and a structured
  `applies_because`. Add `conditions` to every `require`.
- Add `provenance` to mission and definition items.
- Schema `$id`s move to
  `https://shaharwider.github.io/governed-context-pack/schema/`.

## v0.3.0 — 2026-09-28

Who holds access, who answers for it, and which conflicts wait on them.
Breaking per §6 (new MUSTs in §3 and §4).

### Added

- **Sponsor cap (§4.8):** an agent's effective access never exceeds its human sponsor's; a provider refuses to serve an agent whose sponsor is missing or not a human.
- **Ownership and approval (§4.9), required of every conforming provider:** every circle has a human owner — named, inherited from its parent, or the organization's administrators; only owners approve; changing a circle's access is itself audited and restricted to its owners and administrators.
- **Precedence across scopes (§4.10):** lower authority prevails; at equal authority the shallower circle (organization over team over person).
- **Source-derived access (§4.11):** access imported from a source system is never widened by the provider. An outside collaborator is first imported as a guest, and an import never changes the role of a principal the provider already knows.
- **Default posture (§4.12, §5.4, `schema/access-posture.schema.json`):** an optional, versioned, citable default — it adds access like a grant, never gives approval, never reaches a closed circle or a guest, and fails closed when ambiguous.
- Terminology (§1): sponsor, group, owner, posture, guest, source, circle kind.

### Changed

- Guardrail policy subjects (§5.1) gain `group`.
- Posture subjects (§5.4): `org_role: member` names every human except guests; `org_role: guest` names guests.
- **`conflicts` is REQUIRED on every pack** (§3.7). An empty array states
  that the provider knows of no unresolved conflict among the served nodes;
  a missing section no longer means "none or not checked, you guess".
- **Every conflict carries a stable `conflict_id`** (§3.7), provider-assigned
  and identical across every pack that surfaces the same conflict until it is
  resolved or dismissed — one handle for the agent flagging it, the human
  deciding it, and the audit trail. `detected_at` is optional.
- **`conflicts` survives any `token_budget`** (§4.6), alongside
  `mission_slice` and `binding_constraints`: dropping a conflict for space
  would be picking a winner silently.

### Migration

Add `"conflicts": []` to packs that had no conflicts, and a `conflict_id` to
each conflict you already emit.

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
