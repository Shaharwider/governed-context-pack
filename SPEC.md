# Governed Context Pack Specification

**Version:** 0.3.0 (draft) · **Status:** Draft for public review · **License:** CC-BY-4.0 (text) / Apache-2.0 (schemas & examples)

A **context pack** is a structured, permission-scoped, provenance-carrying answer to the question an AI agent asks before doing work: *"What may I know and change here, which decisions govern this task, and what was I told?"* This document specifies the request an agent (or its harness) sends, the response a conforming provider returns, and the behavioral rules that make packs auditable.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in RFC 2119.

This specification defines a wire contract only. It does not prescribe storage, retrieval algorithms, ranking, or policy models — any system that emits conforming packs and honors the behavioral rules is a conforming provider. The natural transport is an MCP tool (e.g. `get_context_pack`), but the contract is transport-agnostic.

---

## 1. Terminology

- **Provider** — the system serving packs (a knowledge/governance layer).
- **Principal** — an identity known to the provider: human, **agent**, or service. Agents are first-class principals. On the wire a principal is the object in §3.8, established by the transport's authentication (§4.1).
- **Sponsor** — the human accountable for an agent principal. An agent's effective access never exceeds its sponsor's (§4.8). On the wire, `sponsor` is required when `kind` is `agent`.
- **Group** — a named set of human principals (a team). Access may be granted to a group, and a policy may name a group as its subject.
- **Owner** — a human, or a group of humans, named as responsible for a circle. Owners approve changes to their circle and hold full access to it and to every circle under it. A circle that names no owner inherits its parent's; at the top, the organization's administrators own it (§4.9). Agents are never owners.
- **Posture** — an organization's default access: who may read, propose or write where before any explicit grant (§4.12, §5.4).
- **Guest** — a human principal outside the posture, for example an outside collaborator imported from a source (§4.11). A guest reaches only what explicit grants, ownership and the source give it, unless a posture rule names guests (§4.12).
- **Source** — an external system (for example a code host) that a circle's human access is imported from (§4.11).
- **Verb** — an action on knowledge held by the provider. The closed set is `read | propose | write | approve | traverse`. A verb is never an action in the outside world (a deploy, a payment, a message sent).
- **Circle** — an org-defined container of knowledge items, identified by `(scope, slug)` and addressed by a path such as `org/doctrine`. Circles are not a fixed set: an organization starts with one and adds more as it goes. Each circle carries an **authority** and optional **roles**.
- **Kind** — what a circle holds: `knowledge`, `guardrail` (policy and posture nodes), `workspace` (one task's working memory) or `system`.
- **Closed** — a flag on a circle. A closed circle, and every circle under it, is outside the default posture (§4.12): only its owners and explicit grants reach it.
- **Authority** — a non-negative integer on a circle: lower = more authoritative, slower-changing, harder to write, and it wins conflicts; 0 is the centre. Values are unbounded and several circles may share one. Providers MUST preserve the ordering semantics (inner beats outer) and MUST NOT attach fixed meanings to particular numbers.
- **Role** — an optional tag on a circle naming what it holds, from an open vocabulary (for example `mission`, `doctrine`, `glossary`, `source`, `decisions`, `product`, `operations`, `external`, `working`). Roles tell a provider which circles feed `mission_slice` and `definitions`; they carry no ordering.
- **Scope** — an organizational position (org → team → person) a circle belongs to.
- **Membrane / guardrail** — a policy boundary between adjacent circles. Membranes MUST only narrow access, never widen it.
- **Node** — one knowledge item (a decision, a definition, a document, a policy…), versioned.
- **Workspace** — a short-lived circle carrying the `working` role, holding one task's working memory.
- **Promotion** — the explicit act of proposing a node inward, into a circle of lower authority. Knowledge MUST NOT drift inward implicitly.
- **Attestation** — a renewal act resetting a node's freshness clock.
- **Pack** — one response conforming to §3, identified by a unique `pack_id`.
- **Extension field** — an object key whose name begins with `x-`. Any object in any payload MAY carry extension fields. A consumer MUST ignore an extension field it does not understand.

## 2. The request

Schema: [`schema/pack-request.schema.json`](schema/pack-request.schema.json).

```json
{
  "intent": "Deploy the billing worker to production",
  "entities": ["billing-worker", "production"],
  "verbs": ["read", "propose", "write"],
  "artifacts": ["services/billing-worker"],
  "token_budget": 8000,
  "as_of": "2026-09-10T12:00:00Z",
  "workspace_id": "ws_01J...",
  "include": { "live_data": false }
}
```

- `intent` (string, REQUIRED) — what the agent is trying to accomplish, in natural language.
- `entities` (string[], OPTIONAL) — the domain entities the task touches. Providers SHOULD resolve these against their glossary (the circles carrying the `glossary` role) and anchor retrieval on them.
- `verbs` (string[], REQUIRED) — what the agent plans to do **to the provider's knowledge**, drawn from the closed set `read | propose | write | approve | traverse`. A value outside it MUST be rejected. Declared verbs are what let the provider compute **binding** constraints (§3.2) instead of dumping policy. Verbs do not name world actions; a deploy is visible to the provider only through `intent` and `artifacts`.
- `artifacts` (string[], OPTIONAL) — concrete artifacts in play (paths, service names, doc ids).
- `token_budget` (integer, OPTIONAL, default provider-defined) — the maximum size of the rendered pack in model tokens. Providers MUST honor it by degrading gracefully (§4.6).
- `as_of` (RFC 3339 timestamp, OPTIONAL) — evaluate knowledge as of this instant. Providers that do not support time travel MUST reject non-current values rather than silently serving current data.
- `workspace_id` (string, OPTIONAL) — associates the pack with a task workspace.
- `include` (object, OPTIONAL) — feature flags, e.g. `live_data`.

Requests are strict. A provider MUST reject a request that carries a field it does not recognise, other than extension fields. A silently ignored request field is a governance hole: the caller would believe a constraint had been applied. The request carries no principal. Who the pack is for is established by authentication (§4.1), not by a field the caller can set.

## 3. The response

Schema: [`schema/pack-response.schema.json`](schema/pack-response.schema.json). A pack contains the following sections, **in this order**. **The order is the precedence rule**: when sections conflict, earlier sections win — mission over policy, policy over decisions, decisions over knowledge.

Rules about actions in the world (a deploy freeze, a spending limit, a "never email the customer") are organizational knowledge. Providers serve them in `decisions_in_force` when they are scoped or expiring, and in `mission_slice` when they are org-wide and standing, selected by relevance to `intent` and `artifacts`. A conforming consumer's harness is where those rules are enforced. `binding_constraints` covers knowledge access only.

### 3.1 `mission_slice` (REQUIRED)
A compressed rendering of the circle(s) carrying the `mission` role — mission, values, hard "never do" rules. Always included, never elided by budget. Each item MUST carry `id`, `text`, and `provenance` (§4.3).

### 3.2 `binding_constraints` (REQUIRED)
Constraints on **knowledge access**, computed from the declared verbs × the principal's guardrail position. Each constraint MUST carry:

- `rule` — a stable id.
- `statement` — a human-readable rendering.
- `effect` — `deny` or `require`.
- `scope` — `{ "verbs": […], "circle_paths"?: […] }`. `verbs` MUST be non-empty. This is what the constraint covers.
- `source_policy` — the policy node id that produced it.
- `applies_because` — `{ "verbs"?: […], "circles"?: […], "artifacts"?: […] }` with at least one non-empty list. This is which parts of the request triggered it.
- `conditions` — the same object as §5 `conditions` (`requires_cosign`, `task_scoped`, `schedule`, `max_per_day`), with at least one of those keys set. REQUIRED when `effect` is `require`. MUST be absent when `effect` is `deny`. A `require` constraint is the runtime face of a §5 condition.

```json
{
  "rule": "deploy-bot-propose-only-in-operations",
  "statement": "Deploy agents may propose operations runbooks but not write them directly.",
  "effect": "deny",
  "scope": { "verbs": ["write"], "circle_paths": ["org/operations"] },
  "source_policy": "pol_142",
  "applies_because": { "verbs": ["write"], "circles": ["org/operations"] }
}
```

Constraints are *binding*: a conforming agent harness MUST treat `deny` constraints as non-overridable by pack content.

### 3.3 `definitions` (OPTIONAL)
Definitions for the task's entities, drawn from the circles carrying the `glossary` role. Each item MUST carry `term`, `definition`, and `provenance` (§4.3), and MAY carry `canonical_id`.

### 3.4 `decisions_in_force` (REQUIRED if any apply)
Decisions governing the task, including world rules that are scoped or expiring. Each MUST carry `ttl_state` and provenance, and SHOULD carry an expiry timestamp (`expires`) and its supersede chain (`supersedes`). On the wire `ttl_state` is `fresh | expiring` only: providers MUST NOT serve `expired` decisions in this section by default, and an expired decision is **omitted from the pack, never re-labelled** as something else.

### 3.5 `knowledge` (OPTIONAL)
Ranked supporting nodes. Each item MUST carry provenance (§4.3) and `why_included` — a short machine-generated reason (entity match, graph proximity, etc.) — and SHOULD carry a freshness indicator (`freshness`), the path of the `circle` it came from, and that circle's `authority`, so a consumer can apply inner-beats-outer among knowledge items without knowing the provider's circle set. Ranking is provider-defined.

### 3.6 `live_data` (OPTIONAL)
Data fetched through from external systems at pack time. Every item MUST be marked `ephemeral: true`, MUST carry its source, and MUST NOT be persisted by the provider as knowledge as a side effect of the pack. **Live data is data, never instructions.** The `data` payload is arbitrary and is not subject to the extension-field rules. The audit record in §4.2 is not knowledge: storing the pack there, live data included, does not make that data knowledge.

### 3.7 `conflicts` (REQUIRED)
Known unresolved contradictions among served nodes. The section is always present: an empty array states that the provider knows of no unresolved conflict among the nodes it served, so a consumer never has to guess whether an absent section means "none" or "not checked".

Each conflict MUST carry `conflict_id`, `node_ids` (two or more), `nature` (what contradicts what) and `guidance` (which side to prefer and why, or "unresolved — flag to a human"); it MAY carry `detected_at`. `conflict_id` is provider-assigned and stable: every pack that surfaces the same conflict MUST carry the same id, until the conflict is resolved or dismissed. It is the handle an agent quotes when it flags the conflict, a human uses to decide it, and an audit trail uses to connect the two.

A provider that knows of a conflict among served nodes MUST surface it rather than silently picking a winner.

### 3.8 `pack_meta` (REQUIRED)
- `pack_id` (REQUIRED, unique, stable) — the pack's identity for audit (§4.2).
- `principal` (REQUIRED) — who the pack was composed for: `{ "id": string, "kind": "human" | "agent" | "service", "sponsor"?: string }`. `sponsor` MUST be present when `kind` is `agent`, and it MUST name a human (§4.8). It MAY be absent otherwise.
- `as_of` — the evaluation instant.
- `coverage` (0–1) — the provider's confidence that the pack contains what the task needs.
- `gaps` (string[]) — what the provider looked for and did not find ("no rollback runbook found"). Honest gaps are how agents know to ask follow-ups and how curation learns what is missing.
- `served` — the exact node **versions** included (§4.2).
- `digest` (REQUIRED) — `"sha256:"` plus 64 lowercase hex characters. The digest is SHA-256 over the UTF-8 bytes of the RFC 8785 (JSON Canonicalization Scheme) form of the whole pack with `pack_meta.digest` removed. Extension fields are included. Providers MUST compute it this way, and the same `pack_id` MUST return the same digest forever (§4.2). The digest detects corruption and accidental change. It is not a signature: anyone who can change the pack can recompute it, so it does not prove which provider issued the pack.
- `workspace_id` (OPTIONAL) — the task workspace this pack belongs to.

`pack_version` (REQUIRED, top-level) — the breaking line the pack conforms to, `MAJOR.MINOR` (for example `"0.3"`). See §6.

## 4. Behavioral rules

### 4.1 Permission scoping
Every pack MUST be composed within the requesting principal's effective access at composition time. A pack MUST NOT contain content the principal could not read directly. The principal is established by the transport's authentication. A provider MUST NOT accept a principal that the caller declares in the request. Denials arising from the request SHOULD cite the producing policy (`source_policy`) rather than fail opaquely.

### 4.2 Pack persistence & identity
Providers MUST persist every pack: the canonical pack bytes (the RFC 8785 form the digest was computed over), `pack_id`, principal, request, `as_of`, the digest, and the exact node versions served. Node versions alone cannot rebuild `live_data`, `why_included`, or text the token budget shortened. This record is audit, not knowledge (§3.6). It is what makes agent decisions reconstructable ("what did the agent know when it acted?"). Providers MUST return the same digest for the same `pack_id` for as long as the record is kept.

### 4.3 Provenance
Every knowledge item, every `mission_slice` item, and every `definitions` item MUST carry provenance: `origin` (author/source/connector) and `method` (`authored` / `imported` / `machine-indexed` / `promoted` / `snapshot`); it SHOULD carry timestamps (`created_at`). Anything *written* by an agent under a pack MUST record that `pack_id` in its own provenance — the causal chain is mandatory, not optional metadata.

### 4.4 Freshness semantics
Nodes age through `fresh → expiring → expired → archived`. `expiring` content MAY be served and MUST be flagged; `expired` content MUST NOT be served by default; `archived` is a state, not deletion — providers SHOULD never destroy knowledge, only archive it.

### 4.5 Membranes narrow
Any policy attached between circles MUST only narrow effective access relative to the enclosing grant. This keeps policy evaluation monotone and pack composition sound.

### 4.6 Budget degradation
When content exceeds `token_budget`, providers MUST degrade per item — full body → best chunks → title + summary — rather than silently dropping whole required sections. `mission_slice`, `binding_constraints` and `conflicts` MUST survive any budget: a conflict dropped for space is a winner picked silently (§3.7).

### 4.7 Workspaces (OPTIONAL feature, RECOMMENDED)
Providers implementing task workspaces MUST link every pack requested under a task to its `workspace_id` (the *context ledger*), and SHOULD offer resumability: journal, pins, artifacts, and a knowledge diff since the previous pack.

### 4.8 Sponsor cap
Every agent principal MUST have a sponsor, and the sponsor MUST be a human. A provider MUST compute an agent's effective access as at most its sponsor's — verb by verb and circle by circle — after every other rule has been applied to the sponsor. A grant made directly to an agent that exceeds its sponsor MUST have no effect, and the denial it produces SHOULD name the sponsor. An agent counts as a member of its sponsor's groups. A provider MUST refuse to serve an agent whose sponsor is missing or is not a human, rather than serve it uncapped.

### 4.9 Ownership and approval
Every circle MUST have at least one effective owner who is a human. Only owners — and principals holding an explicit administrative grant — hold `approve`. Agents MUST NOT hold `approve` except on circles the provider designates as agent-approvable (for example working memory). Changing a circle's owners, grants, closure or source binding is itself an access decision: it MUST be restricted to the circle's owners and the organization's administrators, and it MUST be audited.

### 4.10 Precedence across scopes
When two items conflict, the item from the circle of lower authority prevails; at equal authority, the item from the shallower circle prevails — organization over team, team over person. Providers MUST apply this order wherever they resolve a conflict for a consumer (§3.7) and SHOULD state it in `guidance`.

### 4.11 Source-derived access never widens
When a circle's human access is imported from a source system, a provider MUST NOT give any human more access to that circle, or to any circle under it, than the source gives them; access authored in the provider may only narrow it. Imported access is replaced on each import, not merged: the source stays the system of record for it. A denial it produces SHOULD name the source, so the principal knows where access is granted. Where the source distinguishes an organization's members from its outside collaborators, a provider that defines a posture MUST make each human it first imports as an outside collaborator a guest — otherwise the posture would give a one-repository collaborator the whole organization's default access. An import MUST NOT change the role of a principal the provider already knows; it SHOULD report a disagreement with the source for an administrator to settle.

### 4.12 Default posture
A provider MAY define a default posture (§5.4). If it does, the posture as a whole MUST be a versioned, citable object — like a policy (§5.3 rule 2), it is a node with provenance and a version; its rules carry no version of their own. It adds access the way a grant does — it is not a membrane — and it MUST NOT give `approve`. It MUST NOT apply to a circle marked closed, or to anything under one, and MUST NOT give a human access to a circle whose human access comes from a source (§4.11). It MUST NOT apply to a guest, except through a rule that names guests explicitly (§5.4). A provider without a posture denies by default; a provider whose posture is ambiguous or invalid MUST deny everything the posture would have given.

## 5. Guardrail policy payload (informative for consumers, normative for providers that expose it)

Agents never evaluate policy themselves — they receive the outcome as `binding_constraints` (§3.2). But a provider that publishes, simulates, or tests policies MUST use this shape, so that policy tooling and templates are portable across providers.

Schema: [`schema/guardrail-policy.schema.json`](schema/guardrail-policy.schema.json).

### 5.1 The model

**Grants give access; policies take it away.** A principal starts with whatever its grants allow, and every matching policy rule can only *remove* from that set — never add to it (§4.5). Because every rule subtracts, rules combine by intersection in any order, which is what lets a provider compile a principal's effective access once and reuse it on every request.

A policy answers four questions, one field each:

| Question | Field | Values |
|---|---|---|
| Who does this rule apply to? | `subjects` | list of `{kind, ref}`; kinds: `principal`, `role`, `trust_tier`, `group` — the rule fires if **any** entry matches |
| Which actions on knowledge? | `verbs` | any of `read`, `traverse`, `propose`, `write`, `approve` |
| On which knowledge? | `objects` | selectors, **all** of which must match: `circle_paths` (path prefixes, segment-safe), `authority_min` / `authority_max` (a band of circle authority), `roles` (circles carrying any listed role), `node_types`, `sensitivity_max`. Absent `objects` means everything the principal can otherwise reach |
| What happens? | `effect` | `deny` — remove the matched objects; `allow_up_to` — remove everything **except** the matched objects (a ceiling) |

`authority_*` and `roles` exist so that a template can say "agents write only in working-memory circles" without knowing any circle's slug: circles are org-defined and unbounded (§1), so selectors by path alone cannot describe a policy that should survive the org adding circles.

Two more fields make a policy *knowledge* rather than configuration: `rationale` (the human-readable why, quoted back in every denial) and `version`. `conditions` (`requires_cosign`, `task_scoped`, `schedule`, `max_per_day`) attach requirements to the access that *remains* after the rule applies; they are evaluated at request time. They belong on `allow_up_to` rules — on a `deny` rule there is nothing left for them to condition, and providers SHOULD reject that combination. The same `conditions` object is what a §3.2 `require` constraint carries.

### 5.2 Examples

A denial by path (a ceiling on interns):

```json
{
  "subjects": [{ "kind": "trust_tier", "ref": "intern" }],
  "verbs": ["write"],
  "objects": { "circle_paths": ["org/doctrine"], "sensitivity_max": 2 },
  "effect": "deny",
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

### 5.4 The posture payload

A posture (§4.12) is a list of rules. The list is one versioned object (§4.12); individual rules are not versioned. Each rule answers three questions:

| Question | Field | Values |
|---|---|---|
| Who gets default access? | `subjects` | list of `{kind, ref}`; kinds: `org_role` (`member` names every human in the organization except its guests, `admin` its administrators, `guest` its guests), `role`, `trust_tier`, `group` — the rule fires if **any** entry matches |
| How much? | `access` | `read`, `propose` or `write` — never `admin` (§4.9); `read` gives read and traverse, `propose` adds propose, `write` adds write |
| Where? | `objects` | circle selectors, **all** of which must match: `roles`, `authority_min` / `authority_max`, `circle_kinds`. Absent `objects` means every circle the posture may reach (§4.12) |

Schema: [`schema/access-posture.schema.json`](schema/access-posture.schema.json). Example ([`examples/posture-default-member.json`](examples/posture-default-member.json)):

```json
{
  "subjects": [{ "kind": "org_role", "ref": "member" }],
  "access": "propose",
  "objects": { "circle_kinds": ["knowledge", "workspace"] },
  "rationale": "Every member reads, and may propose to, every open circle; owners approve."
}
```

Read aloud: every human in the organization except its guests may read, traverse and propose on every open knowledge circle and workspace. Guardrails (§5.1) may still narrow it, and an agent reached by a rule like it is still capped by its sponsor (§4.8).

## 6. Versioning & conformance

- This spec is versioned semver-style. `pack_version` names a **breaking line**: `MAJOR.MINOR`. Before 1.0 a breaking change to §2–§4 bumps the minor number (`0.3` → `0.4`). From 1.0 it bumps the major number.
- `pack_version` is REQUIRED at the top level of every response.
- **Additive changes stay inside a line.** A new optional field or section ships as a patch release (for example 0.3.1) and does not change `pack_version`.
- **A new value in a closed set is breaking.** The closed sets are the verb enum, `effect`, `principal.kind`, `provenance.method`, `ttl_state`, `freshness`, policy subject kind, and posture subject kind. Adding a value bumps the breaking line. A consumer MUST reject a value it does not recognise in one of these sets, including when it is otherwise tolerating unknown fields. An unrecognised verb or effect is a governance hole if it is ignored.
- **Producers are strict.** A provider MUST emit only fields defined by the spec release it implements, plus extension fields. The producer JSON Schemas are that check: `additionalProperties: false` with `patternProperties` admitting `^x-` on every object. Those schemas MUST NOT be used to validate a pack a consumer received.
- **Consumers are tolerant within a line.** A consumer MUST ignore fields it does not recognise, which is what lets a 0.3.0 consumer read a 0.3.1 pack, and MUST ignore extension fields it does not understand. A consumer MUST NOT treat a pack from a different breaking line as conforming; it MAY reject it. [`schema/pack-response.consumer.schema.json`](schema/pack-response.consumer.schema.json) is the check for a received pack: unknown fields pass, a different `pack_version` fails, and an unknown value in a closed set fails.
- **Requests stay strict**, as §2 requires. There is no tolerant request schema.
- Any object in any payload MAY carry extension fields (`x-`).

### 6.1 Integrity

`pack_meta.digest` is specified in §3.8. Canonicalization is RFC 8785 (JSON Canonicalization Scheme): object keys sorted by UTF-16 code unit, no insignificant whitespace. The digest is an integrity check. It detects corruption and accidental mutation of the bytes. It does not prove which provider issued the pack, because anyone who can change the pack can recompute the digest. A consumer that needs authenticity needs a signature over the same canonical bytes. That signature is not part of this version; an optional field for it would stay inside this breaking line.

A consumer SHOULD record `pack_id`, `digest`, and the raw pack bytes alongside any action taken under the pack. The raw bytes are what the digest covers. A tolerant parse drops fields the consumer does not know, and a digest recomputed from the parsed pack will not match.

- A **conforming provider** implements §2, §3 (all REQUIRED sections, including `pack_version`, `conflicts`, and `digest`), §4.1–§4.6 and §4.9, plus §4.8 if it serves agent principals. §4.7, §4.10–§4.12 and §5 are optional feature surfaces — but a provider that resolves conflicts, imports access from a source, or defines a posture MUST honour the corresponding rule.
- A **conforming consumer** (agent harness) treats §3.2 `deny` constraints as non-overridable, respects `ephemeral` on live data, does not reorder section precedence, and ignores unknown fields within the breaking line it implements.

## 7. Worked examples

[`examples/request-deploy-task.json`](examples/request-deploy-task.json) → [`examples/response-deploy-task.json`](examples/response-deploy-task.json): an agent preparing a production deploy. The deploy itself is a world action, visible through `intent` and `artifacts`. The declared verbs are `read`, `propose`, and `write` — read the context, propose a rollback runbook, write to the task's working memory. The deploy freeze is an expiring decision in `decisions_in_force`. `binding_constraints` deny a direct write to `org/operations` and require task scope on writes to working memory. An open conflict carries its stable `conflict_id`. `pack_meta.gaps` reports a missing rollback runbook, `principal` names the agent and its sponsor, and `digest` is the fingerprint of that pack. [`examples/policy-intern-no-write.json`](examples/policy-intern-no-write.json) and [`examples/policy-contractor-working-memory.json`](examples/policy-contractor-working-memory.json) are the two §5 policies. [`examples/posture-default-member.json`](examples/posture-default-member.json) is the §5.4 posture rule.

---

*Feedback and proposals: open an issue. Maintained by Circles (shahar@wider-group.com); the reference implementation is the Circles provider — but nothing in this spec requires it.*
