import { bindings, defineConfig, defineWorker, triggers } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "ctms-one",
    entrypoint: "./worker/index.ts",
    compatibilityDate: "2026-10-01",
    compatibilityFlags: ["nodejs_compat"],
    assets: { notFoundHandling: "none" },
    env: {
      ASSETS: bindings.assets(),
    },
    triggers: [
      triggers.scheduled({ schedule: "0 0 * * *" }),
      triggers.scheduled({ schedule: "15 0 * * *" }),
    ],
  }),
});
