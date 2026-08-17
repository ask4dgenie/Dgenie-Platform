// Prisma 7 configuration file. As of Prisma 7, `prisma migrate` / `prisma db`
// commands read their connection details from here rather than from
// `datasource.url` in schema.prisma (see prisma/schema.prisma's comment).
// `DATABASE_URL` should point at the `dgenie_app` Postgres role's connection
// string (apps/web/.env.example documents the shape). Never commit a real
// value — this file only reads the env var, it does not set one.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
