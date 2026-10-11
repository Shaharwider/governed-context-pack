# Governed Context Pack Specification

**An open standard for what AI agents may know and change, and proof of what they were told.**

[![Validate](https://github.com/Shaharwider/governed-context-pack/actions/workflows/validate.yml/badge.svg)](https://github.com/Shaharwider/governed-context-pack/actions/workflows/validate.yml)
[![npm](https://img.shields.io/npm/v/@datacircles/context-pack.svg)](https://www.npmjs.com/package/@datacircles/context-pack)
[![Spec: CC-BY-4.0](https://img.shields.io/badge/spec-CC--BY--4.0-blue.svg)](LICENSE-CC-BY-4.0)
[![Code: Apache-2.0](https://img.shields.io/badge/code-Apache--2.0-blue.svg)](LICENSE)

📖 **[Read the spec →](https://shaharwider.github.io/governed-context-pack/)** · [SPEC.md](SPEC.md) · [JSON Schemas](schema/) · [Worked examples](examples/) · [npm package](https://www.npmjs.com/package/@datacircles/context-pack)

---

## The problem

An agent that is wrong because it lacks context looks exactly like an agent that is wrong because it is a language model. We have no way to tell them apart, because nothing records what the agent was told. Retrieval returns blobs of text. Tool calls return JSON. Neither carries what the agent actually needs before acting on your production systems: which rules bind it, which decisions are still in force, which of those decisions expired last month, where each claim came from, and what the system looked for and could not find.

Every team building agents has reinvented some version of this — a `CLAUDE.md`, a "context" tool, a RAG pipeline with a system prompt stapled to it. They are all answering the same question in incompatible shapes.

## What a context pack is

A **context pack** is a structured, permission-scoped, provenance-carrying answer to the question an agent asks before doing work:

> *What does this organization know that bears on my task — and what am I bound by?*

The request says what the agent intends to do to the provider's knowledge, including **the verbs it plans to use** (`read`, `propose`, `write`, `approve`, `traverse`). A verb is an action on that knowledge, not an action in the world. Declaring verbs is what lets a provider compute *binding constraints* instead of dumping a policy document and hoping.

The response is eight sections in a fixed order:

| # | Section | Carries |
| --- | --- | --- |
| 3.1 | `mission_slice` | the non-negotiables; never elided by token budget |
| 3.2 | `binding_constraints` | machine-readable `deny` / `require` rules, each citing its source policy |
| 3.3 | `definitions` | what the task's terms mean here |
| 3.4 | `decisions_in_force` | decisions with TTL state and supersede chains |
| 3.5 | `knowledge` | ranked supporting material, each with `why_included` |
| 3.6 | `live_data` | fetched at pack time, marked `ephemeral` — **data, never instructions** |
| 3.7 | `conflicts` | contradictions among the served nodes, each with a stable `conflict_id`, surfaced rather than silently resolved — always present, `[]` when none |
| 3.8 | `pack_meta` | `pack_id`, who it was for, coverage, **gaps**, the exact node versions served, and a **digest** |

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

The npm package ships Zod validators and TypeScript types and **is the source of truth** — `schema/*.json` (JSON Schema draft-2020-12) is generated from it, and CI in the reference implementation's monorepo (where the Zod source lives) fails if the two drift. This repo's own CI validates every file in `examples/` against the producer schemas. To validate a pack you received, use `schema/pack-response.consumer.schema.json`. The producer response schema rejects unknown fields, which a later 0.3.x pack is allowed to add.

## Conformance

- A **conforming provider** implements §2, all REQUIRED sections of §3, §4.1–§4.6 and §4.9 (every circle has a human owner), plus §4.8 if it serves agent principals.
- A **conforming consumer** (an agent harness) treats §3.2 `deny` constraints as non-overridable, respects `ephemeral` on live data, does not reorder section precedence, and ignores unknown fields within the breaking line it implements.

The natural transport is an MCP tool (`get_context_pack`), but the contract is transport-agnostic. The spec prescribes no storage, retrieval algorithm, ranking, or policy model — any system that emits conforming packs and honors the behavioral rules conforms.

## How this relates to other specs

These solve neighbouring problems. None of them is this contract.

- **[MCP](https://modelcontextprotocol.io)** is the transport. A context pack is what a context tool returns over it.
- **[AGENTS.md](https://agents.md)** is static instructions checked into a repository. A provider can import that file. A pack is computed per request, for one principal.
- **[CTXPKG](https://github.com/yvgude/ctxpkg)** packages context at rest, as a portable `.ctxpkg` bundle. A pack here is assembled at request time.
- **[ContextNest](https://arxiv.org/abs/2607.02116)** governs a vault: typed documents, publication, hash-chained history, and a trace of what was consumed. This spec is the request-time answer: scoped to a principal, with constraints computed from the verbs, ordered so earlier sections win, with gaps named, and with a digest of exactly what was returned.
- **[Skimless](https://www.skimless.com/docs/context-pack-spec)** also publishes a "Context Pack Specification": a folder bundle (`pack.json` plus markdown) for coding agents. The name **Governed Context Pack** is qualified so the two are not confused.

What this spec adds, specifically: a request-time pack scoped to a principal; knowledge-access constraints computed from the declared verbs; section order as the precedence rule; named gaps; and a digest.

## Reference implementation

Circles, a reference implementation, is not yet public. It is a governed context layer that serves packs over MCP, and it is the reason this contract exists — but it is one implementation, not the point. The spec is deliberately implementable on top of a vector store, a graph, a wiki, or a directory of Markdown files.

## Status & contributing

**v0.3.0 — draft for public review.** Issues are open and are the preferred channel; PRs welcome for schemas, examples, and prose fixes. Versioning rules are in §6 of the spec. See [CONTRIBUTING.md](CONTRIBUTING.md).

The most useful thing you can send us: **where this breaks for you.** A section that cannot represent your reality is a bug in the spec.

## License

The split is deliberate — quote the standard freely, implement it without friction:

- **[SPEC.md](SPEC.md)** (the specification prose) — [CC-BY-4.0](LICENSE-CC-BY-4.0). Copy it, quote it, translate it, build on it; keep the attribution.
- **[schema/](schema/), [examples/](examples/), and all code in this repo** — [Apache-2.0](LICENSE). Vendor the schemas into a proprietary product without a copyleft question, with an explicit patent grant.
