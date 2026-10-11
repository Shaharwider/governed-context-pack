# Contributing

This is a draft standard looking for the places it is wrong. The most valuable
contribution is a concrete case the contract cannot express.

## Issues (preferred)

Issues are open and are the main channel. Useful issues look like:

- **"This section can't represent X."** Describe the real situation and what a
  conforming pack would have to say. Spec gaps beat spec opinions.
- **"§N is ambiguous."** Quote the sentence and the two readings you can defend.
- **"My provider can't implement §N.X."** A MUST that nobody can satisfy is a
  bug in the spec, not in your system.
- **Schema bugs.** A payload that should validate and doesn't, or vice versa.
  Please include the JSON.

## Pull requests

PRs are welcome, especially for:

- typos, clarity fixes, and broken links in `SPEC.md`;
- new worked examples in `examples/` (they run in CI — see below);
- schema corrections.

Before opening a PR that changes normative text (§2–§4), please open an issue
first. Normative changes need a version bump and a CHANGELOG entry, so they are
cheaper to agree on in an issue than to rewrite in a branch.

### The rules a PR has to satisfy

1. **Examples validate.** `.github/workflows/validate.yml` validates every file
   in `examples/` against its schema in `schema/` (draft-2020-12). Locally:

   ```sh
   npm install --no-save ajv ajv-formats
   node scripts/validate-examples.mjs
   ```

   Example filenames pick their schema by prefix: `request-*.json`,
   `response-*.json`, `policy-*.json`.

2. **Schemas are generated, not hand-edited.** `schema/*.json` is exported from
   the Zod schemas in the [`@datacircles/context-pack`](https://www.npmjs.com/package/@datacircles/context-pack)
   package, which is the source of truth. If a schema is wrong, say so in the
   issue/PR and the fix will land in the package and be re-exported here — a
   hand-edit would be silently reverted by the next export.

3. **Normative language follows RFC 2119.** MUST / MUST NOT / SHOULD /
   SHOULD NOT / MAY, used deliberately. If you are not sure which one applies,
   that ambiguity is itself worth an issue.

## Versioning

Versioning rules are normative and live in **§6 of the spec**:

- semver-style; pre-1.0, breaking changes to §2–§4 bump the **minor** version,
  after 1.0 they bump the **major** version;
- packs MUST declare `pack_version` at the top level of the response;
- every released change gets a `CHANGELOG.md` entry and a git tag.

## Scope

In scope: the wire contract — the request, the response and its ordering, the
behavioral rules, the guardrail policy payload.

Out of scope: storage engines, retrieval algorithms, ranking strategies, policy
languages, and any particular product. The spec is deliberately implementable
on a vector store, a graph, a wiki, or a directory of Markdown files. Proposals
that would require one of those choices belong in an implementation, not here.

## Conduct

Be direct about the technology and decent to the people. Disagreement about a
MUST is the point of a draft.
