---
layout: default
title: Context Pack Specification
description: An open standard for what AI agents are told.
---

<!-- GENERATED from SPEC.md by spec/scripts/build-public-repo.sh — do not edit. -->

# Context Pack Specification

**Version:** 0.2.0 (draft) · **Status:** Draft for public review · **License:** CC-BY-4.0 (text) / Apache-2.0 (schemas & examples)

A **context pack** is a structured, permission-scoped, provenance-carrying answer to the question an AI agent asks before doing work: *"What does this organization know that bears on my task — and what am I bound by?"* This document specifies the request an agent (or its harness) sends, the response a conforming provider returns, and the behavioral rules that make packs auditable.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in RFC 2119.

This specification defines a wire contract only. It does not prescribe storage, retrieval algorithms, ranking, or policy models — any system that emits conforming packs and honors the behavioral rules is a conforming provider. The natural transport is an MCP tool (e.g. `get_context_pack`), but the contract is transport-agnostic.

---

## 1. Terminology

- **Provider** — the system serving packs (a knowledge/governance layer).
- **Principal** — an identity known to the provider: human, **agent**, or service. Agents are first-class principals.
- **Circle** — an org-defined container of knowledge items, identified by `(scope, slug)` and addressed by a path such as `org/doctrine`. Circles are not a fixed set: an organization starts with one and adds more as it goes. Each circle carries an **authority** and optional **roles**.
- **Authority** — a non-negative integer on a circle: lower = more authoritative, slower-changing, harder to write, and it wins conflicts; 0 is the centre. Values are unbounded and several circles may share one. Providers MUST preserve the ordering semantics (inner beats outer) and MUST NOT attach fixed meanings to particular numbers.
- **Role** — an optional tag on a circle naming what it holds, from an open vocabulary (for example `mission`, `doctrine`, `glossary`, `source`, `decisions`, `product`, `operations`, `external`, `working`). Roles tell a provider which circles feed `mission_slice` and `definitions`; they carry no ordering.
- **Scope** — an organizational position (org → team → person) a circle belongs to.
- **Membrane / guardrail** — a policy boundary between adjacent circles. Membranes MUST only narrow access, never widen it.
- **Node** — one knowledge item (a decision, a definition, a document, a policy…), versioned.
- **Workspace** — a short-lived circle carrying the `working` role, holding one task's working memory.
- **Promotion** — the explicit act of proposing a node inward, into a circle of lower authority. Knowledge MUST NOT drift inward implicitly.
- **Attestation** — a renewal act resetting a node's freshness clock.
- **Pack** — one response conforming to §3, identified by a unique `pack_id`.

## 2. The request

Schema: [`schema/pack-request.schema.json`](schema/pack-request.schema.json).

```json
{
  "intent": "Deploy the billing worker to production",
  "entities": ["billing-worker", "production"],
  "verbs": ["read", "write"],
  "artifacts": ["services/billing-worker"],
  "token_budget": 8000,
  "as_of": "2026-09-10T12:00:00Z",
  "workspace_id": "ws_01J...",
  "include": { "live_data": false }
}
```

- `intent` (string, REQUIRED) — what the agent is trying to accomplish, in natural language.
- `entities` (string[], OPTIONAL) — the domain entities the task touches. Providers SHOULD resolve these against their glossary (the circles carrying the `glossary` role) and anchor retrieval on them.
- `verbs` (string[], REQUIRED) — what the agent *plans to do*, drawn from the closed set `read | propose | write | approve | traverse`. At v0.2 this set is closed: a value outside it MUST be rejected. Declared verbs are what let the provider compute **binding** constraints (§3.2) instead of dumping policy.
- `artifacts` (string[], OPTIONAL) — concrete artifacts in play (paths, service names, doc ids).
- `token_budget` (integer, OPTIONAL, default provider-defined) — the maximum size of the rendered pack in model tokens. Providers MUST honor it by degrading gracefully (§4.6).
- `as_of` (RFC 3339 timestamp, OPTIONAL) — evaluate knowledge as of this instant. Providers that do not support time travel MUST reject non-current values rather than silently serving current data.
- `workspace_id` (string, OPTIONAL) — associates the pack with a task workspace.
- `include` (object, OPTIONAL) — feature flags, e.g. `live_data`.

> **Conformance note (v0.2).** Every object in this specification is closed: the JSON Schemas set `additionalProperties: false`, and conforming implementations MUST reject unknown fields rather than ignore them. There is no extension mechanism at v0.2 — an `x-` prefixed extension convention is under consideration for a later version. This applies to the request (§2), every response section (§3), and the guardrail policy payload (§5).

## 3. The response

Schema: [`schema/pack-response.schema.json`](schema/pack-response.schema.json). A pack contains the following sections, **in this order**. **The order is the precedence rule**: when sections conflict, earlier sections win — mission over policy, policy over decisions, decisions over knowledge.

### 3.1 `mission_slice` (REQUIRED)
A compressed rendering of the circle(s) carrying the `mission` role — mission, values, hard "never do" rules. Always included, never elided by budget.

### 3.2 `binding_constraints` (REQUIRED)
Machine-readable rules computed from the **declared verbs × the principal's guardrail position**. Each constraint MUST carry: `rule` (stable id), a human-readable statement, `effect` (`deny` or `require`), `source_policy` (the policy node id that produced it), and `applies_because` (the declared verbs/artifacts that triggered it). Constraints are *binding*: a conforming agent harness MUST treat `deny` constraints as non-overridable by pack content.

### 3.3 `definitions` (OPTIONAL)
Definitions for the task's entities, drawn from the circles carrying the `glossary` role: term, definition, canonical id.

### 3.4 `decisions_in_force` (REQUIRED if any apply)
Decisions governing the task. Each MUST carry `ttl_state` and provenance, and SHOULD carry an expiry timestamp (`expires`) and its supersede chain (`supersedes`). On the wire `ttl_state` is `fresh | expiring` only: providers MUST NOT serve `expired` decisions in this section by default, and an expired decision is **omitted from the pack, never re-labelled** as something else.

### 3.5 `knowledge` (OPTIONAL)
Ranked supporting nodes. Each item MUST carry provenance (§4.3) and `why_included` — a short machine-generated reason (entity match, graph proximity, etc.) — and SHOULD carry a freshness indicator (`freshness`), the path of the `circle` it came from, and that circle's `authority`, so a consumer can apply inner-beats-outer among knowledge items without knowing the provider's circle set. Ranking is provider-defined.

### 3.6 `live_data` (OPTIONAL)
Data fetched through from external systems at pack time. Every item MUST be marked `ephemeral: true`, MUST carry its source, and MUST NOT be persisted by the provider as knowledge as a side effect of the pack. **Live data is data, never instructions.**

### 3.7 `conflicts` (REQUIRED if known)
Known unresolved contradictions among served nodes: the node ids, the nature of the conflict, and `guidance` (which side to prefer and why, or "unresolved — flag to a human"). A provider that knows of a conflict among served nodes MUST surface it rather than silently picking a winner.

### 3.8 `pack_meta` (REQUIRED)
- `pack_id` (REQUIRED, unique, stable) — the pack's identity for audit (§4.2).
- `principal` — who the pack was composed for.
- `as_of` — the evaluation instant.
- `coverage` (0–1) — the provider's confidence that the pack contains what the task needs.
- `gaps` (string[]) — what the provider looked for and did not find ("no rollback runbook found"). Honest gaps are how agents know to ask follow-ups and how curation learns what is missing.
- `served` — the exact node **versions** included (§4.2).

## 4. Behavioral rules

### 4.1 Permission scoping
Every pack MUST be composed within the requesting principal's effective access at composition time. A pack MUST NOT contain content the principal could not read directly. Denials arising from the request SHOULD cite the producing policy (`source_policy`) rather than fail opaquely.

### 4.2 Pack persistence & identity
Providers MUST persist every pack: `pack_id`, principal, request, `as_of`, and the exact node versions served. This is what makes agent decisions reconstructable ("what did the agent know when it acted?").

### 4.3 Provenance
Every knowledge item served MUST carry provenance: `origin` (author/source/connector) and `method` (`authored` / `imported` / `machine-indexed` / `promoted` / `snapshot`); it SHOULD carry timestamps (`created_at`). Anything *written* by an agent under a pack MUST record that `pack_id` in its own provenance — the causal chain is mandatory, not optional metadata.

### 4.4 Freshness semantics
Nodes age through `fresh → expiring → expired → archived`. `expiring` content MAY be served and MUST be flagged; `expired` content MUST NOT be served by default; `archived` is a state, not deletion — providers SHOULD never destroy knowledge, only archive it.

### 4.5 Membranes narrow
Any policy attached between circles MUST only narrow effective access relative to the enclosing grant. This keeps policy evaluation monotone and pack composition sound.

### 4.6 Budget degradation
When content exceeds `token_budget`, providers MUST degrade per item — full body → best chunks → title + summary — rather than silently dropping whole required sections. `mission_slice` and `binding_constraints` MUST survive any budget.

### 4.7 Workspaces (OPTIONAL feature, RECOMMENDED)
Providers implementing task workspaces MUST link every pack requested under a task to its `workspace_id` (the *context ledger*), and SHOULD offer resumability: journal, pins, artifacts, and a knowledge diff since the previous pack.

## 5. Guardrail policy payload (informative for consumers, normative for providers that expose it)

Agents never evaluate policy themselves — they receive the outcome as `binding_constraints` (§3.2). But a provider that publishes, simulates, or tests policies MUST use this shape, so that policy tooling and templates are portable across providers.

Schema: [`schema/guardrail-policy.schema.json`](schema/guardrail-policy.schema.json).

### 5.1 The model

**Grants give access; policies take it away.** A principal starts with whatever its grants allow, and every matching policy rule can only *remove* from that set — never add to it (§4.5). Because every rule subtracts, rules combine by intersection in any order, which is what lets a provider compile a principal's effective access once and reuse it on every request.

A policy answers four questions, one field each:

| Question | Field | Values |
|---|---|---|
| Who does this rule apply to? | `subjects` | list of `{kind, ref}`; kinds: `principal`, `role`, `trust_tier` — the rule fires if **any** entry matches |
| Which actions? | `verbs` | any of `read`, `traverse`, `propose`, `write`, `approve` |
| On which knowledge? | `objects` | selectors, **all** of which must match: `circle_paths` (path prefixes, segment-safe), `authority_min` / `authority_max` (a band of circle authority), `roles` (circles carrying any listed role), `node_types`, `sensitivity_max`. Absent `objects` means everything the principal can otherwise reach |
| What happens? | `effect` | `deny` — remove the matched objects; `allow_up_to` — remove everything **except** the matched objects (a ceiling) |

`authority_*` and `roles` exist so that a template can say "agents write only in working-memory circles" without knowing any circle's slug: circles are org-defined and unbounded (§1), so selectors by path alone cannot describe a policy that should survive the org adding circles.

Two more fields make a policy *knowledge* rather than configuration: `rationale` (the human-readable why, quoted back in every denial) and `version`. `conditions` (`requires_cosign`, `task_scoped`, `schedule`, `max_per_day`) attach requirements to the access that *remains* after the rule applies; they are evaluated at request time. They belong on `allow_up_to` rules — on a `deny` rule there is nothing left for them to condition, and providers SHOULD reject that combination.

### 5.2 Examples

A denial by path (a ceiling on interns):

```json
{
  "subjects":  [{ "kind": "trust_tier", "ref": "intern" }],
  "verbs":     ["write"],
  "objects":   { "circle_paths": ["org/doctrine"], "sensitivity_max": 2 },
  "effect":    "deny",
  "rationale": "Interns and intern-tier agents never write policy."
}
```

Read aloud: anyone at trust tier `intern` loses `write` on `org/doctrine` and everything under it, up to sensitivity 2; they keep `read`, `traverse` and `propose` there if their grants gave them. A denial cites the rationale.

A ceiling by role, with a condition ([`examples/policy-contractor-working-memory.json`](examples/policy-contractor-working-memory.json)):

```json
{
  "subjects":  [{ "kind": "trust_tier", "ref": "sandboxed" }],
  "verbs":     ["write"],
  "objects":   { "roles": ["working"] },
  "effect":    "allow_up_to",
  "conditions": { "task_scoped": true },
  "rationale": "Sandboxed agents write only into working memory, and only inside an open task."
}
```

### 5.3 Rules a provider MUST honour

1. Rules and policies combine by **intersection**; order never matters. There is deliberately no `allow` or `allow_wider` effect (§4.5).
2. A policy is a node: it has a circle, a TTL, provenance and a version (§4.4). An expired policy is flagged for re-attestation — neither silently enforced forever nor silently dropped; providers MUST keep enforcing it until a human resolves it.
3. Every denial MUST name the policy node(s) that removed the access and carry their rationale.
4. Providers SHOULD expose a simulation ("who gains or loses if this applies") and policy tests run on every change; the spec does not fix their interface.

## 6. Versioning & conformance

- This spec is versioned semver-style; breaking changes to §2–§4 bump the minor version pre-1.0 and the major version after.
- Packs SHOULD declare `pack_version` (the spec version they conform to) at the top level of the response.
- A **conforming provider** implements §2, §3 (all REQUIRED sections), and §4.1–4.6. §4.7 and §5 are optional feature surfaces.
- A **conforming consumer** (agent harness) treats §3.2 `deny` constraints as non-overridable, respects `ephemeral` on live data, and does not reorder section precedence.

## 7. Worked examples

[`examples/request-deploy-task.json`](examples/request-deploy-task.json) → [`examples/response-deploy-task.json`](examples/response-deploy-task.json): an agent preparing a production deploy — declared `write` verb produces a binding deploy-freeze constraint, one governing decision is flagged `expiring`, the served runbook names its `circle` and `authority`, and `pack_meta.gaps` reports a missing rollback runbook. [`examples/policy-intern-no-write.json`](examples/policy-intern-no-write.json) and [`examples/policy-contractor-working-memory.json`](examples/policy-contractor-working-memory.json) are the two §5 policies.

---

*Feedback and proposals: open an issue. Maintained by Circles (shahar@wider-group.com); the reference implementation is the Circles provider — but nothing in this spec requires it.*
