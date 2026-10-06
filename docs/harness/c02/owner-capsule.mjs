// cuesheet-check-v1: {"executor":"container","image":"sha256:358569078158e76f822a2cd0ed86c440f2244a65ab1385362ab5d29d2d28ceb4","outputs":[],"temporaryStorage":"tmpfs"}
// C02 owner oracle, capsule form. Immutable once pinned. Judges observable audit-diff output only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
const root = process.cwd();
registerHooks({ resolve(spec, ctx, next) {
  try { return next(spec, ctx); } catch (e) { if (/^\.\.?\/.*\.js$/.test(spec)) return next(spec.replace(/\.js$/, ".ts"), ctx); throw e; }
} });
const { diffAuditDocuments, formatDeltaText, formatDeltaJson } = await import(pathToFileURL(join(root, "packages/core/src/audit-diff.ts")).href);
const base = JSON.parse(readFileSync(join(root, "packages/core/fixtures/audit-diff/baseline.json"), "utf8"));
const withCat = (v) => {
  const d = structuredClone(base);
  if (v === "absent") delete d.catalogue; else d.catalogue = { ...d.catalogue, version: v };
  return d;
};
// Warn matrix declared from the requirement, never derived from observed output.
const CASES = [
  { id: "27.0->28.0", a: "27.0", b: "28.0", warn: true, names: ["27.0", "28.0"] },
  { id: "27.0->absent", a: "27.0", b: "absent", warn: true, names: ["27.0"] },
  { id: "absent->28.0", a: "absent", b: "28.0", warn: true, names: ["28.0"] },
  { id: "absent->absent", a: "absent", b: "absent", warn: true, names: [] },
  { id: "unknown->unknown", a: "unknown", b: "unknown", warn: true, names: [] },
  { id: "27.0->27.0", a: "27.0", b: "27.0", warn: false, names: [] }
];
const MISSING = /absent|missing|unknown/i;


const results = {};
for (const c of CASES) {
  const delta = diffAuditDocuments(withCat(c.a), withCat(c.b));
  results[c.id] = { text: formatDeltaText(delta), json: formatDeltaJson(delta), scores: delta.scores };
}
const golden = {
  "27.0->28.0": {
    "text": "baseline 1 report(s), candidate 1 report(s)\nscore macos 33/100 (early, none) -> 33/100 (early, none)\ncontext macos catalogue: 27.0 (current) -> 28.0 (current)\nsummary 0 progression(s), 0 regression(s), 0 added, 0 removed, 1 context change(s)\n",
    "json": "{\n  \"baseline\": [\n    {\n      \"catalogue\": {\n        \"capabilities\": 28,\n        \"nextAction\": \"Keep the catalogue in step with the installed SDK (27.0).\",\n        \"state\": \"current\",\n        \"version\": \"27.0\"\n      },\n      \"conditions\": {\n        \"conditions\": [\n          {\n            \"name\": \"operatingSystem\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"xcode\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"architecture\",\n            \"state\": \"recorded\",\n            \"value\": \"arm64\"\n          },\n          {\n            \"name\": \"locale\",\n            \"state\": \"recorded\",\n            \"value\": \"en-US\"\n          },\n          {\n            \"name\": \"region\",\n            \"state\": \"recorded\",\n            \"value\": \"US\"\n          },\n          {\n            \"name\": \"appleIntelligence\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"account\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"permissions\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"testData\",\n            \"state\": \"unknown\"\n          }\n        ],\n        \"nextAction\": \"Record appleIntelligence, account, permissions, testData before claiming a Siri result.\"\n      },\n      \"findings\": [\n        {\n          \"capability\": \"foundation.app-intent\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [],\n          \"nextAction\": \"Keep foundation.app-intent covered by tests and extracted metadata.\",\n          \"platform\": \"macos\",\n          \"requirements\": [],\n          \"state\": \"detected\"\n        },\n        {\n          \"capability\": \"semantics.app-schema\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [\n            {\n              \"code\": \"ILA120\",\n              \"message\": \"No schema-conformant open intent found.\"\n            }\n          ],\n          \"nextAction\": \"Implement the domain package.\",\n          \"platform\": \"macos\",\n          \"requirements\": [\n            \"AppEntity(schema:)\"\n          ],\n          \"state\": \"detected\"\n        }\n      ],\n      \"reportVersion\": \"1.0\",\n      \"sdk\": {\n        \"canonicalName\": \"macosx27.0\",\n        \"version\": \"27.0\"\n      },\n      \"target\": {\n        \"deploymentTarget\": \"27.0\",\n        \"name\": \"Notes\",\n        \"platform\": \"macos\"\n      }\n    }\n  ],\n  \"candidate\": [\n    {\n      \"catalogue\": {\n        \"capabilities\": 28,\n        \"nextAction\": \"Keep the catalogue in step with the installed SDK (27.0).\",\n        \"state\": \"current\",\n        \"version\": \"28.0\"\n      },\n      \"conditions\": {\n        \"conditions\": [\n          {\n            \"name\": \"operatingSystem\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"xcode\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"architecture\",\n            \"state\": \"recorded\",\n            \"value\": \"arm64\"\n          },\n          {\n            \"name\": \"locale\",\n            \"state\": \"recorded\",\n            \"value\": \"en-US\"\n          },\n          {\n            \"name\": \"region\",\n            \"state\": \"recorded\",\n            \"value\": \"US\"\n          },\n          {\n            \"name\": \"appleIntelligence\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"account\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"permissions\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"testData\",\n            \"state\": \"unknown\"\n          }\n        ],\n        \"nextAction\": \"Record appleIntelligence, account, permissions, testData before claiming a Siri result.\"\n      },\n      \"findings\": [\n        {\n          \"capability\": \"foundation.app-intent\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [],\n          \"nextAction\": \"Keep foundation.app-intent covered by tests and extracted metadata.\",\n          \"platform\": \"macos\",\n          \"requirements\": [],\n          \"state\": \"detected\"\n        },\n        {\n          \"capability\": \"semantics.app-schema\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [\n            {\n              \"code\": \"ILA120\",\n              \"message\": \"No schema-conformant open intent found.\"\n            }\n          ],\n          \"nextAction\": \"Implement the domain package.\",\n          \"platform\": \"macos\",\n          \"requirements\": [\n            \"AppEntity(schema:)\"\n          ],\n          \"state\": \"detected\"\n        }\n      ],\n      \"reportVersion\": \"1.0\",\n      \"sdk\": {\n        \"canonicalName\": \"macosx27.0\",\n        \"version\": \"27.0\"\n      },\n      \"target\": {\n        \"deploymentTarget\": \"27.0\",\n        \"name\": \"Notes\",\n        \"platform\": \"macos\"\n      }\n    }\n  ],\n  \"entries\": [],\n  \"context\": [\n    {\n      \"scope\": \"catalogue\",\n      \"platform\": \"macos\",\n      \"kind\": \"context\",\n      \"baseline\": \"27.0 (current)\",\n      \"candidate\": \"28.0 (current)\"\n    }\n  ],\n  \"scores\": [\n    {\n      \"platform\": \"macos\",\n      \"baseline\": {\n        \"version\": \"1.1\",\n        \"score\": 33,\n        \"band\": \"early\",\n        \"points\": 2,\n        \"maximum\": 6,\n        \"applicable\": 2,\n        \"catalogueVersion\": \"27.0\",\n        \"byGroup\": [\n          {\n            \"group\": \"foundation\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          },\n          {\n            \"group\": \"semantics\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          }\n        ],\n        \"counts\": {\n          \"unsupported\": 0,\n          \"unknown\": 0,\n          \"detected\": 2,\n          \"implemented\": 0,\n          \"tested\": 0,\n          \"feasible\": 0\n        },\n        \"discovery\": \"none\"\n      },\n      \"candidate\": {\n        \"version\": \"1.1\",\n        \"score\": 33,\n        \"band\": \"early\",\n        \"points\": 2,\n        \"maximum\": 6,\n        \"applicable\": 2,\n        \"catalogueVersion\": \"28.0\",\n        \"byGroup\": [\n          {\n            \"group\": \"foundation\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          },\n          {\n            \"group\": \"semantics\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          }\n        ],\n        \"counts\": {\n          \"unsupported\": 0,\n          \"unknown\": 0,\n          \"detected\": 2,\n          \"implemented\": 0,\n          \"tested\": 0,\n          \"feasible\": 0\n        },\n        \"discovery\": \"none\"\n      }\n    }\n  ],\n  \"progressions\": 0,\n  \"regressions\": 0,\n  \"added\": 0,\n  \"removed\": 0\n}\n",
    "scores": [
      {
        "platform": "macos",
        "baseline": {
          "version": "1.1",
          "score": 33,
          "band": "early",
          "points": 2,
          "maximum": 6,
          "applicable": 2,
          "catalogueVersion": "27.0",
          "byGroup": [
            {
              "group": "foundation",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            },
            {
              "group": "semantics",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            }
          ],
          "counts": {
            "unsupported": 0,
            "unknown": 0,
            "detected": 2,
            "implemented": 0,
            "tested": 0,
            "feasible": 0
          },
          "discovery": "none"
        },
        "candidate": {
          "version": "1.1",
          "score": 33,
          "band": "early",
          "points": 2,
          "maximum": 6,
          "applicable": 2,
          "catalogueVersion": "28.0",
          "byGroup": [
            {
              "group": "foundation",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            },
            {
              "group": "semantics",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            }
          ],
          "counts": {
            "unsupported": 0,
            "unknown": 0,
            "detected": 2,
            "implemented": 0,
            "tested": 0,
            "feasible": 0
          },
          "discovery": "none"
        }
      }
    ]
  },
  "27.0->absent": {
    "text": "baseline 1 report(s), candidate 1 report(s)\nscore macos 33/100 (early, none) -> 33/100 (early, none)\ncontext macos catalogue: 27.0 (current) -> absent\nsummary 0 progression(s), 0 regression(s), 0 added, 0 removed, 1 context change(s)\n",
    "json": "{\n  \"baseline\": [\n    {\n      \"catalogue\": {\n        \"capabilities\": 28,\n        \"nextAction\": \"Keep the catalogue in step with the installed SDK (27.0).\",\n        \"state\": \"current\",\n        \"version\": \"27.0\"\n      },\n      \"conditions\": {\n        \"conditions\": [\n          {\n            \"name\": \"operatingSystem\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"xcode\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"architecture\",\n            \"state\": \"recorded\",\n            \"value\": \"arm64\"\n          },\n          {\n            \"name\": \"locale\",\n            \"state\": \"recorded\",\n            \"value\": \"en-US\"\n          },\n          {\n            \"name\": \"region\",\n            \"state\": \"recorded\",\n            \"value\": \"US\"\n          },\n          {\n            \"name\": \"appleIntelligence\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"account\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"permissions\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"testData\",\n            \"state\": \"unknown\"\n          }\n        ],\n        \"nextAction\": \"Record appleIntelligence, account, permissions, testData before claiming a Siri result.\"\n      },\n      \"findings\": [\n        {\n          \"capability\": \"foundation.app-intent\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [],\n          \"nextAction\": \"Keep foundation.app-intent covered by tests and extracted metadata.\",\n          \"platform\": \"macos\",\n          \"requirements\": [],\n          \"state\": \"detected\"\n        },\n        {\n          \"capability\": \"semantics.app-schema\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [\n            {\n              \"code\": \"ILA120\",\n              \"message\": \"No schema-conformant open intent found.\"\n            }\n          ],\n          \"nextAction\": \"Implement the domain package.\",\n          \"platform\": \"macos\",\n          \"requirements\": [\n            \"AppEntity(schema:)\"\n          ],\n          \"state\": \"detected\"\n        }\n      ],\n      \"reportVersion\": \"1.0\",\n      \"sdk\": {\n        \"canonicalName\": \"macosx27.0\",\n        \"version\": \"27.0\"\n      },\n      \"target\": {\n        \"deploymentTarget\": \"27.0\",\n        \"name\": \"Notes\",\n        \"platform\": \"macos\"\n      }\n    }\n  ],\n  \"candidate\": [\n    {\n      \"conditions\": {\n        \"conditions\": [\n          {\n            \"name\": \"operatingSystem\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"xcode\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"architecture\",\n            \"state\": \"recorded\",\n            \"value\": \"arm64\"\n          },\n          {\n            \"name\": \"locale\",\n            \"state\": \"recorded\",\n            \"value\": \"en-US\"\n          },\n          {\n            \"name\": \"region\",\n            \"state\": \"recorded\",\n            \"value\": \"US\"\n          },\n          {\n            \"name\": \"appleIntelligence\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"account\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"permissions\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"testData\",\n            \"state\": \"unknown\"\n          }\n        ],\n        \"nextAction\": \"Record appleIntelligence, account, permissions, testData before claiming a Siri result.\"\n      },\n      \"findings\": [\n        {\n          \"capability\": \"foundation.app-intent\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [],\n          \"nextAction\": \"Keep foundation.app-intent covered by tests and extracted metadata.\",\n          \"platform\": \"macos\",\n          \"requirements\": [],\n          \"state\": \"detected\"\n        },\n        {\n          \"capability\": \"semantics.app-schema\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [\n            {\n              \"code\": \"ILA120\",\n              \"message\": \"No schema-conformant open intent found.\"\n            }\n          ],\n          \"nextAction\": \"Implement the domain package.\",\n          \"platform\": \"macos\",\n          \"requirements\": [\n            \"AppEntity(schema:)\"\n          ],\n          \"state\": \"detected\"\n        }\n      ],\n      \"reportVersion\": \"1.0\",\n      \"sdk\": {\n        \"canonicalName\": \"macosx27.0\",\n        \"version\": \"27.0\"\n      },\n      \"target\": {\n        \"deploymentTarget\": \"27.0\",\n        \"name\": \"Notes\",\n        \"platform\": \"macos\"\n      }\n    }\n  ],\n  \"entries\": [],\n  \"context\": [\n    {\n      \"scope\": \"catalogue\",\n      \"platform\": \"macos\",\n      \"kind\": \"context\",\n      \"baseline\": \"27.0 (current)\",\n      \"candidate\": \"absent\"\n    }\n  ],\n  \"scores\": [\n    {\n      \"platform\": \"macos\",\n      \"baseline\": {\n        \"version\": \"1.1\",\n        \"score\": 33,\n        \"band\": \"early\",\n        \"points\": 2,\n        \"maximum\": 6,\n        \"applicable\": 2,\n        \"catalogueVersion\": \"27.0\",\n        \"byGroup\": [\n          {\n            \"group\": \"foundation\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          },\n          {\n            \"group\": \"semantics\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          }\n        ],\n        \"counts\": {\n          \"unsupported\": 0,\n          \"unknown\": 0,\n          \"detected\": 2,\n          \"implemented\": 0,\n          \"tested\": 0,\n          \"feasible\": 0\n        },\n        \"discovery\": \"none\"\n      },\n      \"candidate\": {\n        \"version\": \"1.1\",\n        \"score\": 33,\n        \"band\": \"early\",\n        \"points\": 2,\n        \"maximum\": 6,\n        \"applicable\": 2,\n        \"catalogueVersion\": \"unknown\",\n        \"byGroup\": [\n          {\n            \"group\": \"foundation\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          },\n          {\n            \"group\": \"semantics\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          }\n        ],\n        \"counts\": {\n          \"unsupported\": 0,\n          \"unknown\": 0,\n          \"detected\": 2,\n          \"implemented\": 0,\n          \"tested\": 0,\n          \"feasible\": 0\n        },\n        \"discovery\": \"none\"\n      }\n    }\n  ],\n  \"progressions\": 0,\n  \"regressions\": 0,\n  \"added\": 0,\n  \"removed\": 0\n}\n",
    "scores": [
      {
        "platform": "macos",
        "baseline": {
          "version": "1.1",
          "score": 33,
          "band": "early",
          "points": 2,
          "maximum": 6,
          "applicable": 2,
          "catalogueVersion": "27.0",
          "byGroup": [
            {
              "group": "foundation",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            },
            {
              "group": "semantics",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            }
          ],
          "counts": {
            "unsupported": 0,
            "unknown": 0,
            "detected": 2,
            "implemented": 0,
            "tested": 0,
            "feasible": 0
          },
          "discovery": "none"
        },
        "candidate": {
          "version": "1.1",
          "score": 33,
          "band": "early",
          "points": 2,
          "maximum": 6,
          "applicable": 2,
          "catalogueVersion": "unknown",
          "byGroup": [
            {
              "group": "foundation",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            },
            {
              "group": "semantics",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            }
          ],
          "counts": {
            "unsupported": 0,
            "unknown": 0,
            "detected": 2,
            "implemented": 0,
            "tested": 0,
            "feasible": 0
          },
          "discovery": "none"
        }
      }
    ]
  },
  "absent->28.0": {
    "text": "baseline 1 report(s), candidate 1 report(s)\nscore macos 33/100 (early, none) -> 33/100 (early, none)\ncontext macos catalogue: absent -> 28.0 (current)\nsummary 0 progression(s), 0 regression(s), 0 added, 0 removed, 1 context change(s)\n",
    "json": "{\n  \"baseline\": [\n    {\n      \"conditions\": {\n        \"conditions\": [\n          {\n            \"name\": \"operatingSystem\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"xcode\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"architecture\",\n            \"state\": \"recorded\",\n            \"value\": \"arm64\"\n          },\n          {\n            \"name\": \"locale\",\n            \"state\": \"recorded\",\n            \"value\": \"en-US\"\n          },\n          {\n            \"name\": \"region\",\n            \"state\": \"recorded\",\n            \"value\": \"US\"\n          },\n          {\n            \"name\": \"appleIntelligence\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"account\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"permissions\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"testData\",\n            \"state\": \"unknown\"\n          }\n        ],\n        \"nextAction\": \"Record appleIntelligence, account, permissions, testData before claiming a Siri result.\"\n      },\n      \"findings\": [\n        {\n          \"capability\": \"foundation.app-intent\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [],\n          \"nextAction\": \"Keep foundation.app-intent covered by tests and extracted metadata.\",\n          \"platform\": \"macos\",\n          \"requirements\": [],\n          \"state\": \"detected\"\n        },\n        {\n          \"capability\": \"semantics.app-schema\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [\n            {\n              \"code\": \"ILA120\",\n              \"message\": \"No schema-conformant open intent found.\"\n            }\n          ],\n          \"nextAction\": \"Implement the domain package.\",\n          \"platform\": \"macos\",\n          \"requirements\": [\n            \"AppEntity(schema:)\"\n          ],\n          \"state\": \"detected\"\n        }\n      ],\n      \"reportVersion\": \"1.0\",\n      \"sdk\": {\n        \"canonicalName\": \"macosx27.0\",\n        \"version\": \"27.0\"\n      },\n      \"target\": {\n        \"deploymentTarget\": \"27.0\",\n        \"name\": \"Notes\",\n        \"platform\": \"macos\"\n      }\n    }\n  ],\n  \"candidate\": [\n    {\n      \"catalogue\": {\n        \"capabilities\": 28,\n        \"nextAction\": \"Keep the catalogue in step with the installed SDK (27.0).\",\n        \"state\": \"current\",\n        \"version\": \"28.0\"\n      },\n      \"conditions\": {\n        \"conditions\": [\n          {\n            \"name\": \"operatingSystem\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"xcode\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"architecture\",\n            \"state\": \"recorded\",\n            \"value\": \"arm64\"\n          },\n          {\n            \"name\": \"locale\",\n            \"state\": \"recorded\",\n            \"value\": \"en-US\"\n          },\n          {\n            \"name\": \"region\",\n            \"state\": \"recorded\",\n            \"value\": \"US\"\n          },\n          {\n            \"name\": \"appleIntelligence\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"account\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"permissions\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"testData\",\n            \"state\": \"unknown\"\n          }\n        ],\n        \"nextAction\": \"Record appleIntelligence, account, permissions, testData before claiming a Siri result.\"\n      },\n      \"findings\": [\n        {\n          \"capability\": \"foundation.app-intent\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [],\n          \"nextAction\": \"Keep foundation.app-intent covered by tests and extracted metadata.\",\n          \"platform\": \"macos\",\n          \"requirements\": [],\n          \"state\": \"detected\"\n        },\n        {\n          \"capability\": \"semantics.app-schema\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [\n            {\n              \"code\": \"ILA120\",\n              \"message\": \"No schema-conformant open intent found.\"\n            }\n          ],\n          \"nextAction\": \"Implement the domain package.\",\n          \"platform\": \"macos\",\n          \"requirements\": [\n            \"AppEntity(schema:)\"\n          ],\n          \"state\": \"detected\"\n        }\n      ],\n      \"reportVersion\": \"1.0\",\n      \"sdk\": {\n        \"canonicalName\": \"macosx27.0\",\n        \"version\": \"27.0\"\n      },\n      \"target\": {\n        \"deploymentTarget\": \"27.0\",\n        \"name\": \"Notes\",\n        \"platform\": \"macos\"\n      }\n    }\n  ],\n  \"entries\": [],\n  \"context\": [\n    {\n      \"scope\": \"catalogue\",\n      \"platform\": \"macos\",\n      \"kind\": \"context\",\n      \"baseline\": \"absent\",\n      \"candidate\": \"28.0 (current)\"\n    }\n  ],\n  \"scores\": [\n    {\n      \"platform\": \"macos\",\n      \"baseline\": {\n        \"version\": \"1.1\",\n        \"score\": 33,\n        \"band\": \"early\",\n        \"points\": 2,\n        \"maximum\": 6,\n        \"applicable\": 2,\n        \"catalogueVersion\": \"unknown\",\n        \"byGroup\": [\n          {\n            \"group\": \"foundation\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          },\n          {\n            \"group\": \"semantics\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          }\n        ],\n        \"counts\": {\n          \"unsupported\": 0,\n          \"unknown\": 0,\n          \"detected\": 2,\n          \"implemented\": 0,\n          \"tested\": 0,\n          \"feasible\": 0\n        },\n        \"discovery\": \"none\"\n      },\n      \"candidate\": {\n        \"version\": \"1.1\",\n        \"score\": 33,\n        \"band\": \"early\",\n        \"points\": 2,\n        \"maximum\": 6,\n        \"applicable\": 2,\n        \"catalogueVersion\": \"28.0\",\n        \"byGroup\": [\n          {\n            \"group\": \"foundation\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          },\n          {\n            \"group\": \"semantics\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          }\n        ],\n        \"counts\": {\n          \"unsupported\": 0,\n          \"unknown\": 0,\n          \"detected\": 2,\n          \"implemented\": 0,\n          \"tested\": 0,\n          \"feasible\": 0\n        },\n        \"discovery\": \"none\"\n      }\n    }\n  ],\n  \"progressions\": 0,\n  \"regressions\": 0,\n  \"added\": 0,\n  \"removed\": 0\n}\n",
    "scores": [
      {
        "platform": "macos",
        "baseline": {
          "version": "1.1",
          "score": 33,
          "band": "early",
          "points": 2,
          "maximum": 6,
          "applicable": 2,
          "catalogueVersion": "unknown",
          "byGroup": [
            {
              "group": "foundation",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            },
            {
              "group": "semantics",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            }
          ],
          "counts": {
            "unsupported": 0,
            "unknown": 0,
            "detected": 2,
            "implemented": 0,
            "tested": 0,
            "feasible": 0
          },
          "discovery": "none"
        },
        "candidate": {
          "version": "1.1",
          "score": 33,
          "band": "early",
          "points": 2,
          "maximum": 6,
          "applicable": 2,
          "catalogueVersion": "28.0",
          "byGroup": [
            {
              "group": "foundation",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            },
            {
              "group": "semantics",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            }
          ],
          "counts": {
            "unsupported": 0,
            "unknown": 0,
            "detected": 2,
            "implemented": 0,
            "tested": 0,
            "feasible": 0
          },
          "discovery": "none"
        }
      }
    ]
  },
  "absent->absent": {
    "text": "baseline 1 report(s), candidate 1 report(s)\nscore macos 33/100 (early, none) -> 33/100 (early, none)\nsummary 0 progression(s), 0 regression(s), 0 added, 0 removed, 0 context change(s)\n",
    "json": "{\n  \"baseline\": [\n    {\n      \"conditions\": {\n        \"conditions\": [\n          {\n            \"name\": \"operatingSystem\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"xcode\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"architecture\",\n            \"state\": \"recorded\",\n            \"value\": \"arm64\"\n          },\n          {\n            \"name\": \"locale\",\n            \"state\": \"recorded\",\n            \"value\": \"en-US\"\n          },\n          {\n            \"name\": \"region\",\n            \"state\": \"recorded\",\n            \"value\": \"US\"\n          },\n          {\n            \"name\": \"appleIntelligence\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"account\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"permissions\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"testData\",\n            \"state\": \"unknown\"\n          }\n        ],\n        \"nextAction\": \"Record appleIntelligence, account, permissions, testData before claiming a Siri result.\"\n      },\n      \"findings\": [\n        {\n          \"capability\": \"foundation.app-intent\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [],\n          \"nextAction\": \"Keep foundation.app-intent covered by tests and extracted metadata.\",\n          \"platform\": \"macos\",\n          \"requirements\": [],\n          \"state\": \"detected\"\n        },\n        {\n          \"capability\": \"semantics.app-schema\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [\n            {\n              \"code\": \"ILA120\",\n              \"message\": \"No schema-conformant open intent found.\"\n            }\n          ],\n          \"nextAction\": \"Implement the domain package.\",\n          \"platform\": \"macos\",\n          \"requirements\": [\n            \"AppEntity(schema:)\"\n          ],\n          \"state\": \"detected\"\n        }\n      ],\n      \"reportVersion\": \"1.0\",\n      \"sdk\": {\n        \"canonicalName\": \"macosx27.0\",\n        \"version\": \"27.0\"\n      },\n      \"target\": {\n        \"deploymentTarget\": \"27.0\",\n        \"name\": \"Notes\",\n        \"platform\": \"macos\"\n      }\n    }\n  ],\n  \"candidate\": [\n    {\n      \"conditions\": {\n        \"conditions\": [\n          {\n            \"name\": \"operatingSystem\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"xcode\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"architecture\",\n            \"state\": \"recorded\",\n            \"value\": \"arm64\"\n          },\n          {\n            \"name\": \"locale\",\n            \"state\": \"recorded\",\n            \"value\": \"en-US\"\n          },\n          {\n            \"name\": \"region\",\n            \"state\": \"recorded\",\n            \"value\": \"US\"\n          },\n          {\n            \"name\": \"appleIntelligence\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"account\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"permissions\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"testData\",\n            \"state\": \"unknown\"\n          }\n        ],\n        \"nextAction\": \"Record appleIntelligence, account, permissions, testData before claiming a Siri result.\"\n      },\n      \"findings\": [\n        {\n          \"capability\": \"foundation.app-intent\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [],\n          \"nextAction\": \"Keep foundation.app-intent covered by tests and extracted metadata.\",\n          \"platform\": \"macos\",\n          \"requirements\": [],\n          \"state\": \"detected\"\n        },\n        {\n          \"capability\": \"semantics.app-schema\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [\n            {\n              \"code\": \"ILA120\",\n              \"message\": \"No schema-conformant open intent found.\"\n            }\n          ],\n          \"nextAction\": \"Implement the domain package.\",\n          \"platform\": \"macos\",\n          \"requirements\": [\n            \"AppEntity(schema:)\"\n          ],\n          \"state\": \"detected\"\n        }\n      ],\n      \"reportVersion\": \"1.0\",\n      \"sdk\": {\n        \"canonicalName\": \"macosx27.0\",\n        \"version\": \"27.0\"\n      },\n      \"target\": {\n        \"deploymentTarget\": \"27.0\",\n        \"name\": \"Notes\",\n        \"platform\": \"macos\"\n      }\n    }\n  ],\n  \"entries\": [],\n  \"context\": [],\n  \"scores\": [\n    {\n      \"platform\": \"macos\",\n      \"baseline\": {\n        \"version\": \"1.1\",\n        \"score\": 33,\n        \"band\": \"early\",\n        \"points\": 2,\n        \"maximum\": 6,\n        \"applicable\": 2,\n        \"catalogueVersion\": \"unknown\",\n        \"byGroup\": [\n          {\n            \"group\": \"foundation\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          },\n          {\n            \"group\": \"semantics\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          }\n        ],\n        \"counts\": {\n          \"unsupported\": 0,\n          \"unknown\": 0,\n          \"detected\": 2,\n          \"implemented\": 0,\n          \"tested\": 0,\n          \"feasible\": 0\n        },\n        \"discovery\": \"none\"\n      },\n      \"candidate\": {\n        \"version\": \"1.1\",\n        \"score\": 33,\n        \"band\": \"early\",\n        \"points\": 2,\n        \"maximum\": 6,\n        \"applicable\": 2,\n        \"catalogueVersion\": \"unknown\",\n        \"byGroup\": [\n          {\n            \"group\": \"foundation\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          },\n          {\n            \"group\": \"semantics\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          }\n        ],\n        \"counts\": {\n          \"unsupported\": 0,\n          \"unknown\": 0,\n          \"detected\": 2,\n          \"implemented\": 0,\n          \"tested\": 0,\n          \"feasible\": 0\n        },\n        \"discovery\": \"none\"\n      }\n    }\n  ],\n  \"progressions\": 0,\n  \"regressions\": 0,\n  \"added\": 0,\n  \"removed\": 0\n}\n",
    "scores": [
      {
        "platform": "macos",
        "baseline": {
          "version": "1.1",
          "score": 33,
          "band": "early",
          "points": 2,
          "maximum": 6,
          "applicable": 2,
          "catalogueVersion": "unknown",
          "byGroup": [
            {
              "group": "foundation",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            },
            {
              "group": "semantics",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            }
          ],
          "counts": {
            "unsupported": 0,
            "unknown": 0,
            "detected": 2,
            "implemented": 0,
            "tested": 0,
            "feasible": 0
          },
          "discovery": "none"
        },
        "candidate": {
          "version": "1.1",
          "score": 33,
          "band": "early",
          "points": 2,
          "maximum": 6,
          "applicable": 2,
          "catalogueVersion": "unknown",
          "byGroup": [
            {
              "group": "foundation",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            },
            {
              "group": "semantics",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            }
          ],
          "counts": {
            "unsupported": 0,
            "unknown": 0,
            "detected": 2,
            "implemented": 0,
            "tested": 0,
            "feasible": 0
          },
          "discovery": "none"
        }
      }
    ]
  },
  "unknown->unknown": {
    "text": "baseline 1 report(s), candidate 1 report(s)\nscore macos 33/100 (early, none) -> 33/100 (early, none)\nsummary 0 progression(s), 0 regression(s), 0 added, 0 removed, 0 context change(s)\n",
    "json": "{\n  \"baseline\": [\n    {\n      \"catalogue\": {\n        \"capabilities\": 28,\n        \"nextAction\": \"Keep the catalogue in step with the installed SDK (27.0).\",\n        \"state\": \"current\",\n        \"version\": \"unknown\"\n      },\n      \"conditions\": {\n        \"conditions\": [\n          {\n            \"name\": \"operatingSystem\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"xcode\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"architecture\",\n            \"state\": \"recorded\",\n            \"value\": \"arm64\"\n          },\n          {\n            \"name\": \"locale\",\n            \"state\": \"recorded\",\n            \"value\": \"en-US\"\n          },\n          {\n            \"name\": \"region\",\n            \"state\": \"recorded\",\n            \"value\": \"US\"\n          },\n          {\n            \"name\": \"appleIntelligence\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"account\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"permissions\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"testData\",\n            \"state\": \"unknown\"\n          }\n        ],\n        \"nextAction\": \"Record appleIntelligence, account, permissions, testData before claiming a Siri result.\"\n      },\n      \"findings\": [\n        {\n          \"capability\": \"foundation.app-intent\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [],\n          \"nextAction\": \"Keep foundation.app-intent covered by tests and extracted metadata.\",\n          \"platform\": \"macos\",\n          \"requirements\": [],\n          \"state\": \"detected\"\n        },\n        {\n          \"capability\": \"semantics.app-schema\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [\n            {\n              \"code\": \"ILA120\",\n              \"message\": \"No schema-conformant open intent found.\"\n            }\n          ],\n          \"nextAction\": \"Implement the domain package.\",\n          \"platform\": \"macos\",\n          \"requirements\": [\n            \"AppEntity(schema:)\"\n          ],\n          \"state\": \"detected\"\n        }\n      ],\n      \"reportVersion\": \"1.0\",\n      \"sdk\": {\n        \"canonicalName\": \"macosx27.0\",\n        \"version\": \"27.0\"\n      },\n      \"target\": {\n        \"deploymentTarget\": \"27.0\",\n        \"name\": \"Notes\",\n        \"platform\": \"macos\"\n      }\n    }\n  ],\n  \"candidate\": [\n    {\n      \"catalogue\": {\n        \"capabilities\": 28,\n        \"nextAction\": \"Keep the catalogue in step with the installed SDK (27.0).\",\n        \"state\": \"current\",\n        \"version\": \"unknown\"\n      },\n      \"conditions\": {\n        \"conditions\": [\n          {\n            \"name\": \"operatingSystem\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"xcode\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"architecture\",\n            \"state\": \"recorded\",\n            \"value\": \"arm64\"\n          },\n          {\n            \"name\": \"locale\",\n            \"state\": \"recorded\",\n            \"value\": \"en-US\"\n          },\n          {\n            \"name\": \"region\",\n            \"state\": \"recorded\",\n            \"value\": \"US\"\n          },\n          {\n            \"name\": \"appleIntelligence\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"account\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"permissions\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"testData\",\n            \"state\": \"unknown\"\n          }\n        ],\n        \"nextAction\": \"Record appleIntelligence, account, permissions, testData before claiming a Siri result.\"\n      },\n      \"findings\": [\n        {\n          \"capability\": \"foundation.app-intent\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [],\n          \"nextAction\": \"Keep foundation.app-intent covered by tests and extracted metadata.\",\n          \"platform\": \"macos\",\n          \"requirements\": [],\n          \"state\": \"detected\"\n        },\n        {\n          \"capability\": \"semantics.app-schema\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [\n            {\n              \"code\": \"ILA120\",\n              \"message\": \"No schema-conformant open intent found.\"\n            }\n          ],\n          \"nextAction\": \"Implement the domain package.\",\n          \"platform\": \"macos\",\n          \"requirements\": [\n            \"AppEntity(schema:)\"\n          ],\n          \"state\": \"detected\"\n        }\n      ],\n      \"reportVersion\": \"1.0\",\n      \"sdk\": {\n        \"canonicalName\": \"macosx27.0\",\n        \"version\": \"27.0\"\n      },\n      \"target\": {\n        \"deploymentTarget\": \"27.0\",\n        \"name\": \"Notes\",\n        \"platform\": \"macos\"\n      }\n    }\n  ],\n  \"entries\": [],\n  \"context\": [],\n  \"scores\": [\n    {\n      \"platform\": \"macos\",\n      \"baseline\": {\n        \"version\": \"1.1\",\n        \"score\": 33,\n        \"band\": \"early\",\n        \"points\": 2,\n        \"maximum\": 6,\n        \"applicable\": 2,\n        \"catalogueVersion\": \"unknown\",\n        \"byGroup\": [\n          {\n            \"group\": \"foundation\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          },\n          {\n            \"group\": \"semantics\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          }\n        ],\n        \"counts\": {\n          \"unsupported\": 0,\n          \"unknown\": 0,\n          \"detected\": 2,\n          \"implemented\": 0,\n          \"tested\": 0,\n          \"feasible\": 0\n        },\n        \"discovery\": \"none\"\n      },\n      \"candidate\": {\n        \"version\": \"1.1\",\n        \"score\": 33,\n        \"band\": \"early\",\n        \"points\": 2,\n        \"maximum\": 6,\n        \"applicable\": 2,\n        \"catalogueVersion\": \"unknown\",\n        \"byGroup\": [\n          {\n            \"group\": \"foundation\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          },\n          {\n            \"group\": \"semantics\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          }\n        ],\n        \"counts\": {\n          \"unsupported\": 0,\n          \"unknown\": 0,\n          \"detected\": 2,\n          \"implemented\": 0,\n          \"tested\": 0,\n          \"feasible\": 0\n        },\n        \"discovery\": \"none\"\n      }\n    }\n  ],\n  \"progressions\": 0,\n  \"regressions\": 0,\n  \"added\": 0,\n  \"removed\": 0\n}\n",
    "scores": [
      {
        "platform": "macos",
        "baseline": {
          "version": "1.1",
          "score": 33,
          "band": "early",
          "points": 2,
          "maximum": 6,
          "applicable": 2,
          "catalogueVersion": "unknown",
          "byGroup": [
            {
              "group": "foundation",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            },
            {
              "group": "semantics",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            }
          ],
          "counts": {
            "unsupported": 0,
            "unknown": 0,
            "detected": 2,
            "implemented": 0,
            "tested": 0,
            "feasible": 0
          },
          "discovery": "none"
        },
        "candidate": {
          "version": "1.1",
          "score": 33,
          "band": "early",
          "points": 2,
          "maximum": 6,
          "applicable": 2,
          "catalogueVersion": "unknown",
          "byGroup": [
            {
              "group": "foundation",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            },
            {
              "group": "semantics",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            }
          ],
          "counts": {
            "unsupported": 0,
            "unknown": 0,
            "detected": 2,
            "implemented": 0,
            "tested": 0,
            "feasible": 0
          },
          "discovery": "none"
        }
      }
    ]
  },
  "27.0->27.0": {
    "text": "baseline 1 report(s), candidate 1 report(s)\nscore macos 33/100 (early, none) -> 33/100 (early, none)\nsummary 0 progression(s), 0 regression(s), 0 added, 0 removed, 0 context change(s)\n",
    "json": "{\n  \"baseline\": [\n    {\n      \"catalogue\": {\n        \"capabilities\": 28,\n        \"nextAction\": \"Keep the catalogue in step with the installed SDK (27.0).\",\n        \"state\": \"current\",\n        \"version\": \"27.0\"\n      },\n      \"conditions\": {\n        \"conditions\": [\n          {\n            \"name\": \"operatingSystem\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"xcode\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"architecture\",\n            \"state\": \"recorded\",\n            \"value\": \"arm64\"\n          },\n          {\n            \"name\": \"locale\",\n            \"state\": \"recorded\",\n            \"value\": \"en-US\"\n          },\n          {\n            \"name\": \"region\",\n            \"state\": \"recorded\",\n            \"value\": \"US\"\n          },\n          {\n            \"name\": \"appleIntelligence\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"account\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"permissions\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"testData\",\n            \"state\": \"unknown\"\n          }\n        ],\n        \"nextAction\": \"Record appleIntelligence, account, permissions, testData before claiming a Siri result.\"\n      },\n      \"findings\": [\n        {\n          \"capability\": \"foundation.app-intent\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [],\n          \"nextAction\": \"Keep foundation.app-intent covered by tests and extracted metadata.\",\n          \"platform\": \"macos\",\n          \"requirements\": [],\n          \"state\": \"detected\"\n        },\n        {\n          \"capability\": \"semantics.app-schema\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [\n            {\n              \"code\": \"ILA120\",\n              \"message\": \"No schema-conformant open intent found.\"\n            }\n          ],\n          \"nextAction\": \"Implement the domain package.\",\n          \"platform\": \"macos\",\n          \"requirements\": [\n            \"AppEntity(schema:)\"\n          ],\n          \"state\": \"detected\"\n        }\n      ],\n      \"reportVersion\": \"1.0\",\n      \"sdk\": {\n        \"canonicalName\": \"macosx27.0\",\n        \"version\": \"27.0\"\n      },\n      \"target\": {\n        \"deploymentTarget\": \"27.0\",\n        \"name\": \"Notes\",\n        \"platform\": \"macos\"\n      }\n    }\n  ],\n  \"candidate\": [\n    {\n      \"catalogue\": {\n        \"capabilities\": 28,\n        \"nextAction\": \"Keep the catalogue in step with the installed SDK (27.0).\",\n        \"state\": \"current\",\n        \"version\": \"27.0\"\n      },\n      \"conditions\": {\n        \"conditions\": [\n          {\n            \"name\": \"operatingSystem\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"xcode\",\n            \"state\": \"recorded\",\n            \"value\": \"27.0\"\n          },\n          {\n            \"name\": \"architecture\",\n            \"state\": \"recorded\",\n            \"value\": \"arm64\"\n          },\n          {\n            \"name\": \"locale\",\n            \"state\": \"recorded\",\n            \"value\": \"en-US\"\n          },\n          {\n            \"name\": \"region\",\n            \"state\": \"recorded\",\n            \"value\": \"US\"\n          },\n          {\n            \"name\": \"appleIntelligence\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"account\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"permissions\",\n            \"state\": \"unknown\"\n          },\n          {\n            \"name\": \"testData\",\n            \"state\": \"unknown\"\n          }\n        ],\n        \"nextAction\": \"Record appleIntelligence, account, permissions, testData before claiming a Siri result.\"\n      },\n      \"findings\": [\n        {\n          \"capability\": \"foundation.app-intent\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [],\n          \"nextAction\": \"Keep foundation.app-intent covered by tests and extracted metadata.\",\n          \"platform\": \"macos\",\n          \"requirements\": [],\n          \"state\": \"detected\"\n        },\n        {\n          \"capability\": \"semantics.app-schema\",\n          \"confidence\": \"high\",\n          \"evidence\": [\n            {\n              \"kind\": \"swift\",\n              \"path\": \"Sources/App/Notes.swift\",\n              \"platform\": \"macos\"\n            }\n          ],\n          \"gaps\": [\n            {\n              \"code\": \"ILA120\",\n              \"message\": \"No schema-conformant open intent found.\"\n            }\n          ],\n          \"nextAction\": \"Implement the domain package.\",\n          \"platform\": \"macos\",\n          \"requirements\": [\n            \"AppEntity(schema:)\"\n          ],\n          \"state\": \"detected\"\n        }\n      ],\n      \"reportVersion\": \"1.0\",\n      \"sdk\": {\n        \"canonicalName\": \"macosx27.0\",\n        \"version\": \"27.0\"\n      },\n      \"target\": {\n        \"deploymentTarget\": \"27.0\",\n        \"name\": \"Notes\",\n        \"platform\": \"macos\"\n      }\n    }\n  ],\n  \"entries\": [],\n  \"context\": [],\n  \"scores\": [\n    {\n      \"platform\": \"macos\",\n      \"baseline\": {\n        \"version\": \"1.1\",\n        \"score\": 33,\n        \"band\": \"early\",\n        \"points\": 2,\n        \"maximum\": 6,\n        \"applicable\": 2,\n        \"catalogueVersion\": \"27.0\",\n        \"byGroup\": [\n          {\n            \"group\": \"foundation\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          },\n          {\n            \"group\": \"semantics\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          }\n        ],\n        \"counts\": {\n          \"unsupported\": 0,\n          \"unknown\": 0,\n          \"detected\": 2,\n          \"implemented\": 0,\n          \"tested\": 0,\n          \"feasible\": 0\n        },\n        \"discovery\": \"none\"\n      },\n      \"candidate\": {\n        \"version\": \"1.1\",\n        \"score\": 33,\n        \"band\": \"early\",\n        \"points\": 2,\n        \"maximum\": 6,\n        \"applicable\": 2,\n        \"catalogueVersion\": \"27.0\",\n        \"byGroup\": [\n          {\n            \"group\": \"foundation\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          },\n          {\n            \"group\": \"semantics\",\n            \"points\": 1,\n            \"maximum\": 3,\n            \"applicable\": 1,\n            \"score\": 33\n          }\n        ],\n        \"counts\": {\n          \"unsupported\": 0,\n          \"unknown\": 0,\n          \"detected\": 2,\n          \"implemented\": 0,\n          \"tested\": 0,\n          \"feasible\": 0\n        },\n        \"discovery\": \"none\"\n      }\n    }\n  ],\n  \"progressions\": 0,\n  \"regressions\": 0,\n  \"added\": 0,\n  \"removed\": 0\n}\n",
    "scores": [
      {
        "platform": "macos",
        "baseline": {
          "version": "1.1",
          "score": 33,
          "band": "early",
          "points": 2,
          "maximum": 6,
          "applicable": 2,
          "catalogueVersion": "27.0",
          "byGroup": [
            {
              "group": "foundation",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            },
            {
              "group": "semantics",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            }
          ],
          "counts": {
            "unsupported": 0,
            "unknown": 0,
            "detected": 2,
            "implemented": 0,
            "tested": 0,
            "feasible": 0
          },
          "discovery": "none"
        },
        "candidate": {
          "version": "1.1",
          "score": 33,
          "band": "early",
          "points": 2,
          "maximum": 6,
          "applicable": 2,
          "catalogueVersion": "27.0",
          "byGroup": [
            {
              "group": "foundation",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            },
            {
              "group": "semantics",
              "points": 1,
              "maximum": 3,
              "applicable": 1,
              "score": 33
            }
          ],
          "counts": {
            "unsupported": 0,
            "unknown": 0,
            "detected": 2,
            "implemented": 0,
            "tested": 0,
            "feasible": 0
          },
          "discovery": "none"
        }
      }
    ]
  }
};
let fails = 0, total = 0;
const check = (ok, msg) => { total++; if (!ok) { fails++; console.log("FAIL", msg); } };
for (const c of CASES) {
  const r = results[c.id], g = golden[c.id];
  check(r.json === g.json, `${c.id}: JSON unchanged`);
  check(JSON.stringify(r.scores) === JSON.stringify(g.scores), `${c.id}: scores unchanged`);
  const gl = g.text.split("\n"), rl = r.text.split("\n");
  // every pristine line must survive, in order, byte for byte
  let i = 0; const extra = [];
  for (const line of rl) { if (i < gl.length && line === gl[i]) i++; else extra.push(line); }
  check(i === gl.length, `${c.id}: all pristine lines preserved in order`);
  if (!c.warn) { check(extra.length === 0, `${c.id}: no warning for same known version (got ${JSON.stringify(extra)})`); continue; }
  const w = extra.filter((l) => l.trim() !== "");
  check(w.length >= 1, `${c.id}: warning present`);
  const joined = w.join("\n");
  check(/warn|not comparable|non-comparable|incomparable/i.test(joined), `${c.id}: warning says comparability is affected`);
  for (const n of c.names) check(joined.includes(n), `${c.id}: warning names version ${n}`);
  if (c.names.length < 2) check(MISSING.test(joined), `${c.id}: warning names the missing/unknown side`);
  check(w.every((l) => !/^score /.test(l)), `${c.id}: score lines not repurposed as the warning`);
}
console.log(`${total - fails}/${total} assertions pass`);
process.exit(fails ? 1 : 0);
