import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

const webBoundaryRules = {
  "no-restricted-globals": [
    "error",
    {
      name: "fetch",
      message:
        "Use the injected frontend API port. Network adapters belong under apps/web/src/api/.",
    },
  ],
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          regex: "^@aws-sdk(?:/|$)|^aws-sdk$",
          message: "AWS SDK implementations are server-only dependencies.",
        },
        {
          regex: "^hono(?:/|$)|^@hono(?:/|$)",
          message: "Hono implementations are server-only dependencies.",
        },
        {
          regex: "^@cert-quiz/(?!contracts(?:/|$))",
          message:
            "The web app may cross workspace boundaries only through @cert-quiz/contracts.",
        },
        {
          regex:
            "(?:^|/)packages/(?:db|domain)(?:/|$)|(?:^|/)apps/api(?:/|$)|^(?:\\.\\./){2,}api(?:/|$)",
          message:
            "The web app must not import database rows, domain implementations, or API implementations.",
        },
      ],
    },
  ],
};

const domainBoundaryRules = {
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          regex: "^react(?:/|$)|^react-dom(?:/|$)",
          message: "Domain code must not depend on React.",
        },
        {
          regex: "^hono(?:/|$)|^@hono(?:/|$)",
          message: "Domain code must not depend on HTTP framework implementations.",
        },
        {
          regex: "^@aws-sdk(?:/|$)|^aws-sdk$",
          message: "Domain code must not depend on AWS SDK implementations.",
        },
        {
          regex:
            "^(?:pg|postgres|mysql2|better-sqlite3|sqlite3|drizzle-orm|kysely|sequelize|prisma|@prisma/client)(?:/|$)",
          message: "Domain code must not depend on SQL drivers or ORMs.",
        },
      ],
    },
  ],
};

const dbBoundaryRules = {
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          regex: "^@cert-quiz/(?:api|web)(?:/|$)",
          message: "Database code must not depend on application or web code.",
        },
        {
          regex: "(?:^|/)apps/(?:api|web)(?:/|$)",
          message: "Database code must not import application or web source paths.",
        },
      ],
    },
  ],
};

const apiBoundaryRules = {
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          regex: "^@cert-quiz/(?!contracts(?:/|$)|domain(?:/|$)|db(?:/|$))",
          message:
            "API code may cross workspace boundaries only through contracts, domain, and db.",
        },
        {
          regex: "(?:^|/)apps/web(?:/|$)",
          message: "API code must not import web source paths.",
        },
      ],
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
        ...globals.node,
      },
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      ...reactRefresh.configs.vite.rules,
      ...webBoundaryRules,
    },
  },
  {
    files: ["apps/web/src/api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": "off",
    },
  },
  {
    files: ["packages/domain/src/**/*.ts"],
    rules: domainBoundaryRules,
  },
  {
    files: ["packages/db/src/**/*.ts"],
    rules: dbBoundaryRules,
  },
  {
    files: ["apps/api/src/**/*.ts"],
    rules: apiBoundaryRules,
  },
  prettier,
);
