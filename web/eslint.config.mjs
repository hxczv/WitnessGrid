import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  {
    ignores: [".next/**", "out/**", "public/sw.js", "public/swe-worker-*", "next-env.d.ts", "*.log"],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // Media is user-uploaded evidence served from the API; <img> with
      // explicit dimensions is intentional there.
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
