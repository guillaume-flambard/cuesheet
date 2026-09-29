import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  countShadowRecords,
  readShadowSpool,
  renderShadowReport,
  type ShadowRecord,
} from "../src/shadow-report.ts";

const rec = (over: Partial<ShadowRecord> = {}): ShadowRecord => ({
  v: 1,
  kind: "delegation_evaluated",
  sessionID: "s1",
  ts: 1000,
  requirements: [],
  verdict: "allowed",
  missing: [],
  registrySize: 248,
  registryUnverified: false,
  matches: [],
  ...over,
});

describe("countShadowRecords", () => {
  it("buckets every record into exactly one outcome", () => {
    const counts = countShadowRecords([
      rec({ verdict: "allowed", requirements: [{ kind: "skill", name: "a", directive: true }] }),
      rec({ verdict: "would_block", requirements: [{ kind: "skill", name: "b", directive: true }], missing: ["b"] }),
      rec({ verdict: "unverified", requirements: [{ kind: "skill", name: "c", directive: true }] }),
      rec({ verdict: "allowed", requirements: [] }),
    ]);

    assert.equal(counts.records, 4);
    assert.equal(counts.allowed, 1, "a verdict with requirements");
    assert.equal(counts.wouldBlock, 1);
    assert.equal(counts.unverified, 1);
    assert.equal(counts.noRequirements, 1);
    assert.ok(
      counts.allowed + counts.wouldBlock + counts.unverified + counts.noRequirements === counts.records,
      "the buckets are exhaustive: nothing is dropped or double-counted",
    );
  });

  it("unverified is never folded into allowed or denied", () => {
    const counts = countShadowRecords([rec({ verdict: "unverified", registryUnverified: true })]);
    assert.equal(counts.unverified, 1);
    assert.equal(counts.allowed, 0);
    assert.equal(counts.wouldBlock, 0);
  });

  it("counts missing requirements by name, most frequent first", () => {
    const counts = countShadowRecords([
      rec({ verdict: "would_block", requirements: [{ kind: "skill", name: "x", directive: true }], missing: ["x"] }),
      rec({ verdict: "would_block", requirements: [{ kind: "skill", name: "x", directive: true }], missing: ["x"] }),
      rec({ verdict: "would_block", requirements: [{ kind: "skill", name: "y", directive: true }], missing: ["y"] }),
    ]);

    assert.deepEqual(counts.missingFrequency, [
      { name: "x", count: 2 },
      { name: "y", count: 1 },
    ]);
  });

  it("a malformed record is counted as malformed, not silently dropped", () => {
    const counts = countShadowRecords([rec({}), { kind: "something_else" } as unknown as ShadowRecord]);
    assert.equal(counts.malformed, 1);
    assert.equal(counts.records, 1);
  });

  it("counts distinct sessions, so a frequency can be read against its breadth", () => {
    const counts = countShadowRecords([
      rec({ sessionID: "a" }),
      rec({ sessionID: "a" }),
      rec({ sessionID: "b" }),
    ]);
    assert.equal(counts.distinctSessions, 2);
    assert.equal(counts.records, 3);
  });
});

describe("renderShadowReport", () => {
  it("says plainly that no outcome column exists yet", () => {
    const md = renderShadowReport(countShadowRecords([rec()]));
    assert.match(md, /No outcome column/);
    assert.match(md, /not the gate's value/);
  });

  it("states the shadow contract in the header: observe, not enforce", () => {
    const md = renderShadowReport(countShadowRecords([rec()]));
    assert.match(md, /shadow mode observes, it does not enforce/);
  });

  it("an unverified record is described as neither pass nor refusal", () => {
    const md = renderShadowReport(countShadowRecords([rec({ verdict: "unverified" })]));
    assert.match(md, /never folded into either/);
  });

  it("shows the missing-frequency list only when there is one", () => {
    const withMissing = renderShadowReport(
      countShadowRecords([rec({ verdict: "would_block", requirements: [{ kind: "skill", name: "z", directive: true }], missing: ["z"] })]),
    );
    assert.match(withMissing, /Unresolvable requirements/);
    assert.match(withMissing, /z: 1/);

    const without = renderShadowReport(countShadowRecords([rec()]));
    assert.doesNotMatch(without, /Unresolvable requirements/);
  });
});

describe("readShadowSpool", () => {
  it("a missing spool is no data, not an empty verdict set", () => {
    const { records, fileExisted } = readShadowSpool("/nonexistent/path/shadow.ndjson");
    assert.equal(fileExisted, false);
    assert.equal(records.length, 0);
  });
});
