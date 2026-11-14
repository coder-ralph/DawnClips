import assert from "node:assert/strict";
import test from "node:test";
import { getSessionSound, setSessionSound } from "../lib/player-prefs";

test("sound starts undecided and follows the last speaker choice for the whole visit", () => {
  assert.deepEqual(getSessionSound(), { on: null, volume: 1 });
  setSessionSound({ on: true });
  assert.equal(getSessionSound().on, true);
  setSessionSound({ volume: 0.4 });
  assert.deepEqual(getSessionSound(), { on: true, volume: 0.4 });
  setSessionSound({ on: false });
  assert.equal(getSessionSound().on, false);
});
