/**
 * CAP-RT-01: the runtime says what it can do, and a plan is compiled against that.
 *
 * From the autonomy spec: multi-agent execution is a capability, not an
 * assumption. When it is unavailable the harness degrades to a sequential plan
 * and PERSISTS that fact, rather than labelling sequential calls as agents or
 * letting a plan believe it was fully served.
 *
 * These tests are deliberately about honesty, not about features. A runtime that
 * reports a capability it does not have is worse than one that reports none,
 * because every plan built on it is wrong in a way nobody can see.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { probeRuntimeCapabilities, describeRuntimeCapabilities } from "../apps/terminal/src/producer/capabilities.ts";
import { resolveCapabilities, type Capability, type Requirement } from "../src/core/capability.ts";

test("CAP-RT-01 every capability carries a reason, and absence is never a blank", () => {
  const caps = probeRuntimeCapabilities();
  assert.ok(caps.probed.length >= 5, "the probe reported nothing, so it is not probing");
  for (const c of caps.probed) {
    assert.ok(c.reason.trim().length > 0, `${c.name} has no reason, so a reader cannot tell absent from unusable`);
    assert.ok(["available", "unavailable"].includes(c.availability));
  }
});

test("CAP-RT-01 sub-agents are reported absent when the runtime has no task capability", () => {
  const off = probeRuntimeCapabilities({ subagentsAvailable: false });
  const sub = off.probed.find((c) => c.name === "subagents");
  assert.equal(sub?.availability, "unavailable");
  assert.match(sub?.reason ?? "", /sequentially|no sub-agent/i);
  // The degradation must be stated, not hidden: a plan that quietly runs one
  // thing at a time while its graph claims branches is the mislabelling forbidden.
  assert.match(describeRuntimeCapabilities(off), /séquentiel/);

  const on = probeRuntimeCapabilities({ subagentsAvailable: true });
  assert.equal(on.probed.find((c) => c.name === "subagents")?.availability, "available");
  assert.doesNotMatch(describeRuntimeCapabilities(on), /séquentiel/);
});

test("CAP-RT-01 the capsule is only claimed when it is actually configured", () => {
  const before = { image: process.env.CUESHEET_TEST_CAPSULE_IMAGE, socket: process.env.CUESHEET_TEST_TOOL_SOCKET };
  try {
    delete process.env.CUESHEET_TEST_CAPSULE_IMAGE;
    delete process.env.CUESHEET_TEST_TOOL_SOCKET;
    const bare = probeRuntimeCapabilities();
    assert.equal(bare.probed.find((c) => c.name === "capsule")?.availability, "unavailable");

    process.env.CUESHEET_TEST_CAPSULE_IMAGE = "sha256:" + "a".repeat(64);
    process.env.CUESHEET_TEST_TOOL_SOCKET = "/tmp/socket";
    const withCapsule = probeRuntimeCapabilities();
    assert.equal(withCapsule.probed.find((c) => c.name === "capsule")?.availability, "available");
  } finally {
    if (before.image === undefined) delete process.env.CUESHEET_TEST_CAPSULE_IMAGE; else process.env.CUESHEET_TEST_CAPSULE_IMAGE = before.image;
    if (before.socket === undefined) delete process.env.CUESHEET_TEST_TOOL_SOCKET; else process.env.CUESHEET_TEST_TOOL_SOCKET = before.socket;
  }
});

test("CAP-RT-01 the registry the Core resolver consumes holds only what is available", () => {
  const caps = probeRuntimeCapabilities({ subagentsAvailable: false });
  const names = caps.registry.map((c) => c.name);
  assert.ok(names.includes("model"), "the provider adapter is available");
  assert.ok(!names.includes("subagents"), "an absent capability must not reach the resolver, or a plan would be admitted on it");
  // And the Core resolver, unchanged, does the refusing.
  const required: Requirement[] = [{ kind: "runtime", name: "subagents" }];
  const resolution = resolveCapabilities(required, caps.registry as Capability[], { now: 0 });
  assert.equal(resolution.verdict, "blocked", "a plan requiring sub-agents must be blocked when they are absent");
});

test("CAP-RT-01 a plan requiring an available capability is admitted", () => {
  const caps = probeRuntimeCapabilities();
  const resolution = resolveCapabilities([{ kind: "runtime", name: "shell" }], caps.registry as Capability[], { now: 0 });
  assert.equal(resolution.verdict, "ready");
});

test("CAP-RT-01 an absent capability is never silently substituted", () => {
  // The asymmetry from Core: an unresolvable capability is a fact of this
  // instant and must not degrade into a weaker plan silently.
  const caps = probeRuntimeCapabilities();
  const resolution = resolveCapabilities([{ kind: "runtime", name: "subagents" }], caps.registry as Capability[], { now: 0 });
  assert.equal(resolution.verdict, "blocked");
  assert.equal(resolution.resolution.unresolved.length, 1);
  assert.ok(resolution.resolution.unresolved[0]!.reasons.length > 0, "the refusal states its grounds");
});
