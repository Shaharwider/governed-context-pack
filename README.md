# Context Pack Specification

**An open standard for what AI agents are told.**

[![Validate](https://github.com/Shaharwider/context-pack-spec/actions/workflows/validate.yml/badge.svg)](https://github.com/Shaharwider/context-pack-spec/actions/workflows/validate.yml)
[![npm](https://img.shields.io/npm/v/@datacircles/context-pack.svg)](https://www.npmjs.com/package/@datacircles/context-pack)
[![Spec: CC-BY-4.0](https://img.shields.io/badge/spec-CC--BY--4.0-blue.svg)](LICENSE-CC-BY-4.0)
[![Code: Apache-2.0](https://img.shields.io/badge/code-Apache--2.0-blue.svg)](LICENSE)

📖 **[Read the spec →](https://shaharwider.github.io/context-pack-spec/)** · [SPEC.md](SPEC.md) · [JSON Schemas](schema/) · [Worked examples](examples/) · [npm package](https://www.npmjs.com/package/@datacircles/context-pack)

---

## The problem

An agent that is wrong because it lacks context looks exactly like an agent that is wrong because it is a language model. We have no way to tell them apart, because nothing records what the agent was told. Retrieval returns blobs of text. Tool calls return JSON. Neither carries what the agent actually needs before acting on your production systems: which rules bind it, which decisions are still in force, which of those decisions expired last month, where each claim came from, and what the system looked for and could not find.

Every team building agents has reinvented some version of this — a `CLAUDE.md`, a "context" tool, a RAG pipeline with a system prompt stapled to it. They are all answering the same question in incompatible shapes.

## What a context pack is

A **context pack** is a structured, permission-scoped, provenance-carrying answer to the question an agent asks before doing work:

> *What does this organization know that bears on my task — and what am I bound by?*

The request says what the agent intends to do, including **the verbs it plans to use** (`read`, `propose`, `write`, `approve`, `traverse`). Declaring verbs is what lets a provider compute *binding constraints* instead of dumping a policy document and hoping.

The response is eight sections in a fixed order:

| # | Section | Carries |
| --- | --- | --- |
| 3.1 | `mission_slice` | the non-negotiables; never elided by token budget |
| 3.2 | `binding_constraints` | machine-readable `deny` / `require` rules, each citing its source policy |
| 3.3 | `definitions` | what the task's terms mean here |
| 3.4 | `decisions_in_force` | decisions with TTL state and supersede chains |
| 3.5 | `knowledge` | ranked supporting material, each with `why_included` |
| 3.6 | `live_data` | fetched at pack time, marked `ephemeral` — **data, never instructions** |
| 3.7 | `conflicts` | contradictions among the served nodes, surfaced rather than silently resolved |
| 3.8 | `pack_meta` | `pack_id`, coverage, **gaps**, and the exact node versions served |

## Why the order is the whole point

**The order is the precedence rule.** When sections conflict, earlier sections win: mission over policy, policy over decisions, decisions over knowledge.

This is the part that a flat retrieval result cannot express. A vector search returns ten chunks and leaves the model to guess which one outranks the others — so the freshest-sounding chunk usually wins, which is how an agent ends up acting on a proposal that was never approved. Ordering is cheap to implement, trivial to audit, and it is the difference between "here is some relevant text" and "here is what governs you."

Two more things follow from it:

- **`binding_constraints` are not advice.** A conforming consumer treats `deny` as non-overridable by anything later in the pack. Pack content cannot talk an agent out of a constraint.
- **`pack_meta.gaps` is a feature.** The provider reports what it looked for and did not find ("no rollback runbook found for billing-worker"). An agent that knows what is missing can ask; an agent that does not, confabulates.

## Try it

```sh
npm install @datacircles/context-pack
```

```ts
import { contextPackResponseSchema } from "@datacircles/context-pack";

const pack = contextPackResponseSchema.parse(await provider.getPack(request));
for (const c of pack.binding_constraints.filter((c) => c.effect === "deny")) {
  throw new Error(`${c.rule}: ${c.statement} (from ${c.source_policy})`);
}
```

The npm package ships Zod validators and TypeScript types and **is the source of truth** — `schema/*.json` (JSON Schema draft-2020-12) is generated from it, and CI in the reference implementation's monorepo (where the Zod source lives) fails if the two drift. This repo's own CI validates every file in `examples/` against `schema/`, which is the check that matters to you as a consumer.

## Conformance

- A **conforming provider** implements §2, all REQUIRED sections of §3, and §4.1–4.6.
- A **conforming consumer** (an agent harness) treats §3.2 `deny` constraints as non-overridable, respects `ephemeral` on live data, and does not reorder section precedence.

The natural transport is an MCP tool (`get_context_pack`), but the contract is transport-agnostic. The spec prescribes no storage, retrieval algorithm, ranking, or policy model — any system that emits conforming packs and honors the behavioral rules conforms.

## Reference implementation

Circles, a reference implementation, is not yet public. It is a governed context layer that serves packs over MCP, and it is the reason this contract exists — but it is one implementation, not the point. The spec is deliberately implementable on top of a vector store, a graph, a wiki, or a directory of Markdown files.

## Status & contributing

**v0.2.0 — draft for public review.** Issues are open and are the preferred channel; PRs welcome for schemas, examples, and prose fixes. Versioning rules are in §6 of the spec. See [CONTRIBUTING.md](CONTRIBUTING.md).

The most useful thing you can send us: **where this breaks for you.** A section that cannot represent your reality is a bug in the spec.

## License

The split is deliberate — quote the standard freely, implement it without friction:

- **[SPEC.md](SPEC.md)** (the specification prose) — [CC-BY-4.0](LICENSE-CC-BY-4.0). Copy it, quote it, translate it, build on it; keep the attribution.
- **[schema/](schema/), [examples/](examples/), and all code in this repo** — [Apache-2.0](LICENSE). Vendor the schemas into a proprietary product without a copyleft question, with an explicit patent grant.
