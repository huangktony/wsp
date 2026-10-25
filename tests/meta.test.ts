import test from "node:test";
import assert from "node:assert/strict";
import { generatePlans, mockPlans } from "../lib/meta";
import type { Place } from "../lib/serpapi";

const places = [
  { name: "Park", category: "outdoors", price: "$", cost: 0 },
  { name: "Cafe", category: "food", price: "$", cost: 12 },
  { name: "Gallery", category: "art", price: "$", cost: 10 },
] as Place[];
const ctx = { city: "Austin, TX", slot: "Saturday afternoon", tier: "$", interests: ["art"], places };
const plans = places.map(p => ({ title: p.name, summary: "An outing", stops: [{ place: p.name, time: "2 PM" }], est_cost_per_person: p.cost, why_fits: "Matches your interests" }));
const response = (value: unknown, finish_reason = "stop") => new Response(JSON.stringify({ choices: [{ finish_reason, message: { content: typeof value === "string" ? value : JSON.stringify(value) } }] }), { status: 200 });

test("Meta generation validates output and falls back safely", async t => {
  const originalFetch = globalThis.fetch;
  const previous = { META_API_KEY: process.env.META_API_KEY, META_MODEL: process.env.META_MODEL, USE_MOCKS: process.env.USE_MOCKS };
  try {
    process.env.META_API_KEY = "test-key";
    process.env.USE_MOCKS = "false";
    delete process.env.META_MODEL;
    await t.test("uses Meta bearer auth, structured JSON and no stored output", async () => {
      let calls = 0;
      globalThis.fetch = async (url, init) => {
        calls++;
        assert.equal(url, "https://api.meta.ai/v1/chat/completions");
        assert.equal((init!.headers as Record<string,string>).Authorization, "Bearer test-key");
        const body = JSON.parse(init!.body as string);
        assert.equal(body.model, "muse-spark-1.3");
        assert.equal(body.response_format.type, "json_schema");
        assert.equal(body.response_format.json_schema.strict, true);
        assert.equal(body.store, false);
        assert.ok(init!.signal);
        return response({ plans });
      };
      assert.deepEqual(await generatePlans(ctx), plans);
      assert.equal(calls, 1);
    });
    await t.test("allows a configured Meta model", async () => {
      process.env.META_MODEL = "account-model";
      globalThis.fetch = async (_, init) => { assert.equal(JSON.parse(init!.body as string).model, "account-model"); return response({ plans }); };
      assert.deepEqual(await generatePlans(ctx), plans);
      delete process.env.META_MODEL;
    });
    for (const [label, reply] of [
      ["invalid JSON", () => response("not JSON")],
      ["invalid schema", () => response({ plans: [] })],
      ["invented place", () => response({ plans: plans.map(p => ({ ...p, stops: [{ place: "Invented", time: "2 PM" }] })) })],
      ["over budget", () => response({ plans: plans.map(p => ({ ...p, stops: [{ place: "Luxury", time: "2 PM" }] })) })],
      ["truncated output", () => response({ plans }, "length")],
      ["provider failure", () => new Response("private provider error", { status: 503 })],
      ["timeout", () => { throw new DOMException("Timed out", "TimeoutError"); }],
    ] as const) {
      await t.test(`${label} retries once then uses candidate-based fallback`, async () => {
        let calls = 0;
        globalThis.fetch = async () => { calls++; return reply(); };
        const input = { ...ctx, places: [...places, { name: "Luxury", category: "food", price: "$$$", cost: 90 } as Place] };
        assert.deepEqual(await generatePlans(input), mockPlans(input.places, input.slot, input.tier));
        assert.equal(calls, 2);
      });
    }
    await t.test("missing key and mock mode never call a provider", async () => {
      globalThis.fetch = async () => { throw Error("Network must not be used"); };
      delete process.env.META_API_KEY;
      assert.deepEqual(await generatePlans(ctx), mockPlans(places, ctx.slot, ctx.tier));
      process.env.META_API_KEY = "test-key";
      process.env.USE_MOCKS = "true";
      assert.deepEqual(await generatePlans(ctx), mockPlans(places, ctx.slot, ctx.tier));
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key,value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
