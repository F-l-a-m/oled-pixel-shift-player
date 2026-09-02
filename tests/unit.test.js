// Unit tests for the pure functions in shared-constants.js.
// No test framework dependency — uses Node's built-in test runner.
// Run with: node --test tests/unit.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const vm = require("vm");

// shared-constants.js defines everything via `globalThis.x = ...`, so we
// load it into a throwaway sandbox rather than require()-ing it directly.
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("shared-constants.js", "utf8"), sandbox);

const { clampOledSettings, nextOledPhase, OLED_PHASE, OLED_DEFAULTS } = sandbox;

test("clampOledSettings: fills in missing fields with defaults", () => {
    const result = clampOledSettings({});
    assert.deepEqual(result, OLED_DEFAULTS);
});

test("clampOledSettings: clamps out-of-range values into bounds", () => {
    const result = clampOledSettings({
        scaleMin: -5,
        scaleMax: 50,
        safetyMarginPct: 999,
        durationXs: 0,
        durationYs: -10,
        durationScaleS: 999999
    });

    assert.equal(result.scaleMin, 0.1);
    assert.equal(result.scaleMax, 1);
    assert.equal(result.safetyMarginPct, 20);
    assert.equal(result.durationXs, 1);
    assert.equal(result.durationYs, 1);
    assert.equal(result.durationScaleS, 3600);
});

test("clampOledSettings: never lets scaleMax end up below scaleMin", () => {
    const result = clampOledSettings({ scaleMin: 0.9, scaleMax: 0.2 });
    assert.ok(result.scaleMax >= result.scaleMin);
});

test("clampOledSettings: NaN/garbage input falls back to the default for that field", () => {
    const result = clampOledSettings({ scaleMin: "not a number", durationXs: undefined });
    assert.equal(result.scaleMin, OLED_DEFAULTS.scaleMin);
    assert.equal(result.durationXs, OLED_DEFAULTS.durationXs);
});

test("clampOledSettings: does not mutate its input", () => {
    const input = { scaleMin: -5 };
    clampOledSettings(input);
    assert.deepEqual(input, { scaleMin: -5 });
});

test("nextOledPhase: START moves IDLE -> STARTING", () => {
    assert.equal(nextOledPhase(OLED_PHASE.IDLE, "START"), OLED_PHASE.STARTING);
});

test("nextOledPhase: READY moves STARTING -> RUNNING", () => {
    assert.equal(nextOledPhase(OLED_PHASE.STARTING, "READY"), OLED_PHASE.RUNNING);
});

test("nextOledPhase: FINISH moves STARTING -> IDLE", () => {
    assert.equal(nextOledPhase(OLED_PHASE.STARTING, "FINISH"), OLED_PHASE.IDLE);
});

test("nextOledPhase: FINISH is a no-op once already RUNNING", () => {
    assert.equal(nextOledPhase(OLED_PHASE.RUNNING, "FINISH"), null);
});

test("nextOledPhase: STOP moves either STARTING or RUNNING to IDLE", () => {
    assert.equal(nextOledPhase(OLED_PHASE.STARTING, "STOP"), OLED_PHASE.IDLE);
    assert.equal(nextOledPhase(OLED_PHASE.RUNNING, "STOP"), OLED_PHASE.IDLE);
});

test("nextOledPhase: STOP is a no-op while already IDLE", () => {
    assert.equal(nextOledPhase(OLED_PHASE.IDLE, "STOP"), null);
});

test("nextOledPhase: START is a no-op while STARTING or RUNNING (no restart-via-START)", () => {
    assert.equal(nextOledPhase(OLED_PHASE.STARTING, "START"), null);
    assert.equal(nextOledPhase(OLED_PHASE.RUNNING, "START"), null);
});

test("nextOledPhase: unknown event is always a no-op", () => {
    for (const phase of Object.values(OLED_PHASE)) {
        assert.equal(nextOledPhase(phase, "NOT_A_REAL_EVENT"), null);
    }
});
