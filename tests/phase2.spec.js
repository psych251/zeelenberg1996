// End-to-end test for Phase 2 (phase2/experiment.js): a robot participant runs the extension.
// Phase 1's robot is tests/experiment.spec.js and is not changed.
//
// Emulator only: every page load here carries ?emulator=1, and the tests skip themselves when
// the emulator is not running (plain `npx playwright test`), so Phase 2 tests can never write to
// the live Firebase project. Run them with `npm test`.
//
// If you change the Phase 2 timeline, update `runPhase2` below so the robot still knows which
// buttons to press.

const { test, expect } = require("@playwright/test");

const EMULATOR = process.env.EMULATOR === "1" || !!process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = "demo-psych251";
const EXPERIMENT_ID = "zeelenberg1996-phase2";
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const CONDITIONS = ["risky_feedback", "safe_feedback"];
const VERSIONS = ["x_on_safe", "x_on_risky"];

// The part of the study each screen belongs to, mirroring `section` in phase2/experiment.js.
const SECTION_OF = {
  consent: "intro", instructions: "intro", matching: "matching", equality_check: "matching",
  feedback_instructions: "feedback_rules", comprehension: "feedback_rules",
  choice: "decision", preference_strength: "decision", reasons: "decision",
  regret_scale: "regret_scale", curiosity: "curiosity", end_survey: "about_you", debrief: "debrief",
};
const REGRET_ANSWERS = [5, 4, 6, 3, 2];   // score (5 + 4 + 6 + 3 + (8 - 2)) / 5 = 4.8
const REASONS_TEXT = "Robot participant says hi. I chose this gamble.";
const NO_REASON = "Gamble B still feels a bit safer to me.";

function quizKey(condition) {
  return {
    q1: "35%", q2: "65%", q3: "Yes",
    q4: condition === "safe_feedback" ? "Yes" : "No",
    q5: condition === "risky_feedback" ? "Yes" : "No",
  };
}

async function fsGet(path) {
  // "Bearer owner" is the emulator's admin token: it bypasses security rules, like the Admin SDK.
  const r = await fetch(`${FS}/${path}`, { headers: { Authorization: "Bearer owner" } });
  return { status: r.status, body: r.status === 200 ? await r.json() : null };
}
function decode(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decode);
  return v;
}
function decodeFields(fields) {
  const out = {};
  for (const k of Object.keys(fields)) out[k] = decode(fields[k]);
  return out;
}

// The finished run's participant document and its trial rows, in order.
async function savedRun(page) {
  const id = await page.evaluate(() => window.__saver.docId);
  const p = await fsGet(`experiments/${EXPERIMENT_ID}/participants/${id}`);
  expect(p.status).toBe(200);
  const pdoc = decodeFields(p.body.fields);
  const chunks = await fsGet(`experiments/${EXPERIMENT_ID}/participants/${id}/trials?pageSize=500`);
  const trials = ((chunks.body && chunks.body.documents) || []).map((d) => decodeFields(d.fields))
    .flatMap((d) => d.trials).sort((a, b) => a.trial_index - b.trial_index);
  return { id, pdoc, trials };
}

const rate = async (page, a, b) => {
  await page.locator('[data-name="attract_r"]').getByText(String(a), { exact: true }).click();
  await page.locator('[data-name="attract_s"]').getByText(String(b), { exact: true }).click();
};
const surveyContinue = (page) => page.locator('input[value="Continue"]').click();

// Plays Phase 2 from consent to "All done". `matching(page)` does the matching screen;
// `feltEqual` answers the equality check ("Yes", or "No" to end the study there).
async function runPhase2(page, { condition, matching, feltEqual = "Yes", choose = "Gamble A", quizTexts = [] }) {
  await page.getByRole("button", { name: "I agree to participate" }).click();
  await expect(page.getByText("takes about nine minutes")).toBeVisible();
  await page.locator("#jspsych-instructions-next").click();

  await matching(page);

  // Equality check (row 9), right after matching.
  await expect(page.getByText("You rated Gamble A and Gamble B as equally attractive.")).toBeVisible();
  await expect(page.getByText("Your answer will not affect whether your Prolific submission is approved")).toBeVisible();
  await page.locator('[data-name="felt_equal"]').getByText(feltEqual, { exact: true }).click();
  if (feltEqual === "No") {
    // Which and why are required once No is picked.
    await surveyContinue(page);
    await expect(page.getByText("Response required.").first()).toBeVisible();
    await page.locator('[data-name="more_attractive"]').getByText("Gamble B", { exact: true }).click();
    await page.locator('[data-name="felt_equal_reason"] textarea').fill(NO_REASON);
    await surveyContinue(page);
    // The study ends for them: straight to the debrief, never the feedback rule.
    await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();
    await expect(page.locator(".feedback-rule")).toHaveCount(0);
  } else {
    await surveyContinue(page);
    // Feedback instructions + quiz, then the choice.
    const shown = await page.locator(".gamble-page[data-condition]").getAttribute("data-condition");
    expect(shown).toBe(condition);
    await page.getByRole("button", { name: "Continue" }).click();
    for (const text of quizTexts) await expect(page.getByText(text)).toBeVisible();
    for (const [q, text] of Object.entries(quizKey(condition))) {
      await page.locator(`[data-name="${q}"]`).getByText(text, { exact: true }).click();
    }
    await page.locator('input[value="Check my answers"]').click();
    await page.getByRole("button", { name: choose }).click();
    await page.locator('[data-name="strength"]').getByText("9", { exact: true }).click();
    await surveyContinue(page);
    await page.locator('[data-name="reasons"] textarea').pressSequentially(REASONS_TEXT);
    await surveyContinue(page);
    await expect(page.locator(".jspsych-survey-likert-opts").first()).toBeVisible();
    for (const [i, v] of REGRET_ANSWERS.entries()) {
      await page.locator(`input[name="Q${i}"][value="${v - 1}"]`).check();
    }
    await page.locator("#jspsych-survey-likert-next").click();
    // Curiosity (row 10): required, 1-7, after the Regret Scale.
    await expect(page.getByText("how did you feel about finding out how the gamble you did not choose")).toBeVisible();
    await page.locator("#jspsych-survey-likert-next").click();
    await expect(page.getByText("how did you feel about finding out how the gamble you did not choose")).toBeVisible();
    await page.locator('input[name="Q0"][value="5"]').check();   // 6 on the 1-7 scale
    await page.locator("#jspsych-survey-likert-next").click();
    // End form, unchanged from Phase 1.
    await page.locator('input[name="gamble_freq_12mo"][value="Never"]').check();
    await page.locator('input[name="feedback_reliance"][value="Prefer not to say"]').check();
    await page.locator("#age").selectOption("22");
    await page.locator('input[name="gender"][value="Prefer not to say"]').check();
    await page.locator('input[name="race"][value="Prefer not to say"]').check();
    await page.locator('input[name="ethnicity"][value="Prefer not to say"]').check();
    await page.locator("#jspsych-survey-html-form-next").click();
  }
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("All done")).toBeVisible({ timeout: 30000 });
}

test.describe("phase 2", () => {
  test.skip(!EMULATOR, "Phase 2 tests need the Firestore emulator (run them with npm test)");

  test("version 1 (X on Gamble B): unequal ratings are refused until X is changed, then runs to the end", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/phase2/?emulator=1&condition=risky_feedback&version=x_on_safe&PROLIFIC_PID=p2robot");
    await page.waitForFunction(() => window.__saver && window.__saver.docId);

    await runPhase2(page, {
      condition: "risky_feedback",
      matching: async (p) => {
        const x = p.locator('[data-name="x"] input');
        const update = p.getByRole("button", { name: "Update X" });
        const card = p.locator(".x-value");
        // X sits on Gamble B; the new explanation is shown; the range is (0, 130).
        await expect(p.getByText("Make Gamble B exactly as attractive as Gamble A")).toBeVisible();
        await expect(p.getByText("X is a prize: the amount you could win with Gamble B")).toBeVisible();
        await expect(p.getByText("you will not receive either gamble")).toBeVisible();
        await x.fill("150");
        await update.click();
        await expect(p.getByText("more than $0 and less than $130")).toBeVisible();
        await x.fill("60");
        await update.click();
        await expect(card).toHaveText("$60");
        // Unequal ratings: refused, ratings cleared and hidden, the gamble rated higher named.
        await rate(p, 7, 6);
        await surveyContinue(p);
        await expect(p.getByText("You rated Gamble A as more attractive than Gamble B")).toBeVisible();
        await expect(p.locator('[data-name="attract_r"]')).toHaveCount(0);
        // The same X is not accepted again, and Continue is still blocked.
        await update.click();
        await expect(p.getByText("equally attractive to you, then click Update X").first()).toBeVisible();
        await expect(p.locator('[data-name="attract_r"]')).toHaveCount(0);
        await surveyContinue(p);
        await expect(p.getByText("Make Gamble B exactly as attractive as Gamble A")).toBeVisible();
        // A changed X brings the ratings back; equal ratings are accepted.
        await x.fill("70");
        await update.click();
        await expect(card).toHaveText("$70");
        await rate(p, 7, 7);
        await surveyContinue(p);
      },
    });
    expect(errors, "uncaught page errors").toEqual([]);

    const { id, pdoc, trials } = await savedRun(page);
    expect(pdoc.completed).toBe(true);
    expect(pdoc.condition).toBe("risky_feedback");
    expect(pdoc.matching_version).toBe("x_on_safe");
    expect(pdoc.felt_equal).toBe("yes");
    expect(pdoc.screened_out).toBe(false);
    expect(trials.map((t) => t.task)).toEqual([
      "consent", "instructions", "matching", "equality_check", "feedback_instructions", "comprehension",
      "choice", "preference_strength", "reasons", "regret_scale", "curiosity", "end_survey", "debrief",
    ]);
    expect(pdoc.n_trials).toBe(trials.length);
    expect(trials.every((t) => t.participant_id === id && t.matching_version === "x_on_safe")).toBe(true);

    const m = trials.find((t) => t.task === "matching");
    expect(m.matched_x).toBe(70);
    expect([m.attract_r, m.attract_s]).toEqual([7, 7]);
    expect(m.matching_tries).toBe(2);
    expect(m.rating_history).toEqual([{ x: 60, attract_r: 7, attract_s: 6 }, { x: 70, attract_r: 7, attract_s: 7 }]);
    expect(m.x_history).toEqual([60, 70]);
    expect(m.x_gamble).toBe("safe");
    expect(m.fixed_prize).toBe(130);
    const eq = trials.find((t) => t.task === "equality_check");
    expect([eq.felt_equal, eq.more_attractive, eq.felt_equal_reason]).toEqual(["yes", null, null]);
    expect(trials.find((t) => t.task === "choice").choice).toBe("risky");
    const cur = trials.find((t) => t.task === "curiosity");
    expect(cur.curiosity).toBe(6);
    expect(cur.choice).toBe("risky");
    expect(trials.find((t) => t.task === "regret_scale").regret_score).toBe(4.8);

    // Every row carries its part of the study, and the parts add up to the total.
    for (const t of trials) expect(t.section, `section of ${t.task}`).toBe(SECTION_OF[t.task]);
    expect(Object.values(pdoc.section_ms).reduce((a, b) => a + b, 0)).toBe(pdoc.total_ms);
  });

  test("version 2 (X on Gamble A): its own range, cards and quiz wording", async ({ page }) => {
    await page.goto("/phase2/?emulator=1&condition=safe_feedback&version=x_on_risky");
    await page.waitForFunction(() => window.__saver && window.__saver.docId);
    await runPhase2(page, {
      condition: "safe_feedback",
      choose: "Gamble B",
      // Quiz items 1 and 2 name each gamble's prize in this version.
      quizTexts: ["What is the chance of winning $130 with Gamble A?", "What is the chance of winning $70 with Gamble B?"],
      matching: async (p) => {
        const x = p.locator('[data-name="x"] input');
        const update = p.getByRole("button", { name: "Update X" });
        await expect(p.getByText("Make Gamble A exactly as attractive as Gamble B")).toBeVisible();
        await expect(p.getByText("X is a prize: the amount you could win with Gamble A")).toBeVisible();
        // Gamble B shows its fixed $70; X must be between $70 and $500.
        await expect(p.locator(".gamble-card").nth(1)).toContainText("$70 with 65%");
        for (const bad of ["50", "600"]) {
          await x.fill(bad);
          await update.click();
          await expect(p.getByText("more than $70 and less than $500")).toBeVisible();
        }
        await x.fill("130");
        await update.click();
        await expect(p.locator(".gamble-card").nth(0).locator(".x-value")).toHaveText("$130");
        await rate(p, 8, 8);
        await surveyContinue(p);
      },
    });
    const { pdoc, trials } = await savedRun(page);
    expect(pdoc.matching_version).toBe("x_on_risky");
    expect(pdoc.condition).toBe("safe_feedback");
    const m = trials.find((t) => t.task === "matching");
    expect([m.matched_x, m.matching_tries, m.x_gamble, m.fixed_prize]).toEqual([130, 1, "risky", 70]);
    expect(trials.find((t) => t.task === "choice").choice).toBe("safe");
    expect(trials.find((t) => t.task === "comprehension").quiz_passed).toBe(true);
  });

  test("answering No at the equality check ends the study before the feedback rule", async ({ page }) => {
    await page.goto("/phase2/?emulator=1&condition=risky_feedback&version=x_on_safe");
    await page.waitForFunction(() => window.__saver && window.__saver.docId);
    await runPhase2(page, {
      condition: "risky_feedback",
      feltEqual: "No",
      matching: async (p) => {
        await p.locator('[data-name="x"] input').fill("75");
        await p.getByRole("button", { name: "Update X" }).click();
        await rate(p, 6, 6);
        await surveyContinue(p);
      },
    });
    const { pdoc, trials } = await savedRun(page);
    expect(pdoc.completed).toBe(true);
    expect(pdoc.felt_equal).toBe("no");
    expect(pdoc.screened_out).toBe(true);
    expect(trials.map((t) => t.task)).toEqual(["consent", "instructions", "matching", "equality_check", "debrief"]);
    const eq = trials.find((t) => t.task === "equality_check");
    expect([eq.felt_equal, eq.more_attractive, eq.felt_equal_reason]).toEqual(["no", "safe", NO_REASON]);
    expect(trials.some((t) => t.task === "choice" || t.task === "feedback_instructions")).toBe(false);
  });

  test("assignment uses only risky and safe feedback, and both matching versions", async ({ page }) => {
    const seen = { condition: new Set(), version: new Set() };
    for (let i = 0; i < 16; i++) {
      await page.goto("/phase2/?emulator=1");
      await page.waitForFunction(() => window.__saver && window.__saver.docId);
      await page.evaluate(() => window.__saver._settle());
      const { pdoc } = await savedRun(page);
      expect(CONDITIONS).toContain(pdoc.condition);
      expect(VERSIONS).toContain(pdoc.matching_version);
      seen.condition.add(pdoc.condition);
      seen.version.add(pdoc.matching_version);
    }
    // 16 random draws miss one of two values with probability 2 x 0.5^16 (about 1 in 33,000).
    expect(seen.version.size).toBe(2);
    expect(seen.condition.size).toBe(2);
  });
});
