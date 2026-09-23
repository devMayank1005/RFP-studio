import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsdoc from "eslint-plugin-jsdoc";

// Environment variables must go through src/lib/env.ts.
//
// A pasted value with a trailing newline once put a control character into
// Microsoft's token endpoint URL in a sibling Kognoz app, and the only symptom
// was a sign-in redirect loop. readEnv/readSecret strip that; a raw read cannot.
// NODE_ENV is exempt: the toolchain sets it, nobody pastes it.
const NO_RAW_PROCESS_ENV = {
  selector:
    'MemberExpression[object.object.name="process"][object.property.name="env"]:not([property.name="NODE_ENV"])',
  message:
    "Read environment variables through readEnv/requireEnv in src/lib/env.ts, not process.env directly.",
};

const NO_FETCH_IN_DOMAIN = {
  selector: 'CallExpression[callee.name="fetch"]',
  message:
    "src/domain is the pure layer — no I/O. Fetch in an adapter (src/lib, src/engine) and pass the result in.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".vercel/**",
    "drizzle/**",
    "fixtures/**",
    "playwright-report/**",
    "test-results/**",
  ]),
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    // Tests are exempt because they must set process.env to exercise the reader.
    ignores: ["src/lib/env.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": ["error", NO_RAW_PROCESS_ENV],
    },
  },
  {
    // src/domain is pure: enums, compliance mapping, triage sort, chunking and
    // the zod schemas the engine is constrained to. It must be testable without
    // a network, a database, or a running app.
    files: ["src/domain/**/*.ts", "src/domain/**/*.tsx"],
    rules: {
      "no-restricted-syntax": ["error", NO_RAW_PROCESS_ENV, NO_FETCH_IN_DOMAIN],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/db", "@/db/*",
                "@/lib", "@/lib/*",
                "@/engine", "@/engine/*",
                "@/inngest", "@/inngest/*",
                "@/app", "@/app/*",
                "**/db/*", "**/engine/*",
              ],
              message:
                "src/domain is the pure layer — no imports from db, lib, engine, inngest or app.",
            },
          ],
        },
      ],
    },
  },
  {
    // docs/developer-guide.md §3: every exported function in the service layers
    // carries a TSDoc comment. Components are out of scope (the guide covers
    // service code). The count reached zero on 2026-09-23; an undocumented
    // export now fails lint, exactly as the guide asks.
    files: [
      "src/domain/**/*.ts",
      "src/engine/**/*.ts",
      "src/inngest/**/*.ts",
      "src/db/**/*.ts",
      "src/lib/**/*.ts",
      "src/app/actions/**/*.ts",
    ],
    ignores: ["src/**/*.test.ts", "src/db/schema/**", "src/db/seed/**"],
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: { FunctionDeclaration: true, ClassDeclaration: true },
          contexts: [
            "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression",
            "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > FunctionExpression",
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
