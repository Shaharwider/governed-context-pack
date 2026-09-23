#!/usr/bin/env node
/**
 * Validates every file in `examples/` against the matching JSON Schema in
 * `schema/` (JSON Schema draft-2020-12).
 *
 * The example's filename prefix picks the schema:
 *   request-*.json  -> pack-request.schema.json
 *   response-*.json -> pack-response.schema.json
 *   policy-*.json   -> guardrail-policy.schema.json
 *
 * Run it from the repo root:
 *
 *   npm install --no-save ajv ajv-formats
 *   node scripts/validate-examples.mjs
 *
 * This is the same check CI runs (.github/workflows/validate.yml).
 */
import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const specRoot = join(here, "..");
const schemaDir = join(specRoot, "schema");
const exampleDir = join(specRoot, "examples");

const SCHEMA_FOR_PREFIX = {
  request: "pack-request.schema.json",
  response: "pack-response.schema.json",
  policy: "guardrail-policy.schema.json",
};

/** ajv is installed ad hoc at the repo root — see the header. */
async function loadAjv() {
  const require = createRequire(import.meta.url);
  const ajvModule = require("ajv/dist/2020.js");
  const formatsModule = require("ajv-formats");
  return {
    Ajv2020: ajvModule.default ?? ajvModule,
    addFormats: formatsModule.default ?? formatsModule,
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const { Ajv2020, addFormats } = await loadAjv();
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);

  // Register every schema up front so cross-schema $refs would resolve.
  for (const file of await readdir(schemaDir)) {
    if (!file.endsWith(".json")) continue;
    ajv.addSchema(await readJson(join(schemaDir, file)), file);
  }

  const examples = (await readdir(exampleDir)).filter((f) => f.endsWith(".json")).sort();
  if (examples.length === 0) {
    console.error("examples/ contains no .json files — nothing to validate.");
    process.exit(1);
  }

  let failures = 0;
  for (const file of examples) {
    const prefix = file.split("-")[0];
    const schemaFile = SCHEMA_FOR_PREFIX[prefix];
    if (!schemaFile) {
      console.error(
        `FAIL ${file}: no schema mapped for prefix "${prefix}-" ` +
          `(expected one of ${Object.keys(SCHEMA_FOR_PREFIX).join(", ")})`,
      );
      failures += 1;
      continue;
    }
    const validate = ajv.getSchema(schemaFile);
    const data = await readJson(join(exampleDir, file));
    if (validate(data)) {
      console.log(`ok   ${file} -> ${schemaFile}`);
    } else {
      failures += 1;
      console.error(`FAIL ${file} -> ${schemaFile}`);
      for (const error of validate.errors ?? []) {
        console.error(`       ${error.instancePath || "/"} ${error.message}`);
      }
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} example(s) failed validation.`);
    process.exit(1);
  }
  console.log(`\n${examples.length} example(s) valid against draft-2020-12 schemas.`);
}

await main();
