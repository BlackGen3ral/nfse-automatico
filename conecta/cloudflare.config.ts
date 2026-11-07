import { defineConfig, triggers } from "@cloudflare/config";
export default defineConfig({
  worker: {
    name: "nfse-conecta",
    compatibilityDate: "2026-11-07",
    entrypoint: "./server/index.js",
    env: { DB: { type: "d1", id: "5a2dbd83-1bc4-44cb-9f96-6067ccda97ee" } },
    triggers: [triggers.scheduled({schedule:"*/5 * * * *"})],
    observability: {
      enabled: true,
      redactQueryString: true,
      logs: { enabled: true, invocationLogs: false },
      traces: { enabled: true, headSamplingRate: 0.01 },
    },
  },
});
