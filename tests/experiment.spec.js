// End-to-end test: a robot participant runs the whole experiment.
//
// Two modes:
//   - Emulator mode (EMULATOR=1, set automatically by `npm test`): data must land in the
//     local Firestore emulator, the security rules must reject forbidden requests, and
//     client errors must be logged.
//   - Offline mode (plain `npx playwright test`): the experiment must still run to the end
//     and offer the JSON download fallback.
//
// If you change the timeline in experiment.js, update `runUntilDebrief` below so the
// robot still knows which buttons to press. That is a feature: the test documents the flow.

const { test, expect, devices } = require("@playwright/test");

const EMULATOR = process.env.EMULATOR === "1" || !!process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = "demo-psych251";
const EXPERIMENT_ID = "zeelenberg1996-pilot-a-test";
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const CONDITIONS = ["choice_only", "risky_feedback", "safe_feedback"];

// Rows per participant: consent, welcome, matching, attractiveness, (feedback instructions +
// quiz) per quiz attempt, choice, strength, reasons, regret scale, end form, debrief.
const nTrials = (quizAttempts) => 10 + 2 * quizAttempts;

// The robot's regret-scale answers (1-7). Item 5 is reverse-scored, so the score is
// (5 + 4 + 6 + 3 + (8 - 2)) / 5 = 4.8.
const REGRET_ANSWERS = [5, 4, 6, 3, 2];

// Correct quiz answers as shown on screen, mirroring QUIZ_KEY in experiment.js.
function quizKey(condition) {
  return {
    q1: "35%",
    q2: "65%",
    q3: "Yes",
    q4: condition === "safe_feedback" ? "Yes" : "No",
    q5: condition === "risky_feedback" ? "Yes" : "No",
  };
}

async function answerQuiz(page, answers) {
  for (const [q, text] of Object.entries(answers)) {
    await page.locator(`[data-name="${q}"]`).getByText(text, { exact: true }).click();
  }
  await page.locator('input[value="Check my answers"]').click();
}

// Plays the experiment from consent to the debrief screen, without pressing "Finish".
// Returns the condition shown on the feedback instructions. Pass `condition` to check it
// (the URL can force one in emulator runs), and `quizWrongOnce` to fail the quiz on the
// first try so the instructions and quiz repeat.
// The part of the study each screen belongs to, mirroring `section` in experiment.js.
const SECTION_OF = {
  consent: "intro", instructions: "intro", matching: "matching", attractiveness: "matching",
  feedback_instructions: "feedback_rules", comprehension: "feedback_rules",
  choice: "decision", preference_strength: "decision", reasons: "decision",
  regret_scale: "regret_scale", end_survey: "about_you", debrief: "debrief",
};
const REASONS_TEXT = "Robot participant says hi.";

async function runUntilDebrief(page, { condition = null, quizWrongOnce = false, tabAway = false } = {}) {
  // 1. consent
  await page.getByRole("button", { name: "I agree to participate" }).click();
  // 2. welcome (one page)
  await page.locator("#jspsych-instructions-next").click();
  // 3. matching: an X outside ($0, $130) is refused, then X = 70. SurveyJS commits a typed
  // value on blur, which the real click on Continue provides.
  const x = page.locator('[data-name="x"] input');
  if (tabAway) {
    // Simulate switching to another tab for ~300 ms (jsPsych listens to window blur/focus).
    await x.waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  }
  await x.fill("150");
  await page.locator('input[value="Continue"]').click();
  await expect(page.getByText("more than $0 and less than $130")).toBeVisible();
  await x.fill("70");
  await page.locator('input[value="Continue"]').click();
  // 4. attractiveness of each gamble (1-12)
  await page.locator('[data-name="attract_r"]').getByText("7", { exact: true }).click();
  await page.locator('[data-name="attract_s"]').getByText("6", { exact: true }).click();
  await page.locator('input[value="Continue"]').click();
  // 5. feedback instructions + comprehension quiz, repeated until all five answers are correct
  const shown = await page.locator(".gamble-page[data-condition]").getAttribute("data-condition");
  if (condition) expect(shown).toBe(condition);
  const key = quizKey(shown);
  if (quizWrongOnce) {
    await page.getByRole("button", { name: "Continue" }).click();
    await answerQuiz(page, { ...key, q1: "65%" });
    await expect(page.getByText("Some of your answers were incorrect")).toBeVisible();
  }
  await page.getByRole("button", { name: "Continue" }).click();
  await answerQuiz(page, key);
  // 6. choice (key DV): Gamble R
  await page.getByRole("button", { name: "Gamble R" }).click();
  // 7. strength of preference
  await page.locator('[data-name="strength"]').getByText("9", { exact: true }).click();
  await page.locator('input[value="Continue"]').click();
  // 8. reasons: typed key by key (each key is counted), then a paste attempt, which is blocked
  // and announced under the box.
  const box = page.locator('[data-name="reasons"] textarea');
  await box.pressSequentially(REASONS_TEXT);
  await box.evaluate((el) => {
    const clip = new DataTransfer();
    clip.setData("text/plain", "PASTED FROM ELSEWHERE");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clip, bubbles: true, cancelable: true }));
  });
  await expect(page.getByText("Pasting is turned off for this question")).toBeVisible();
  await expect(box).toHaveValue(REASONS_TEXT);
  await page.locator('input[value="Continue"]').click();
  // 9. regret scale: required, so an empty submit stays on the page. The plugin's radio
  // values are label indices (0-6).
  await page.locator("#jspsych-survey-likert-next").click();
  await expect(page.locator(".jspsych-survey-likert-opts").first()).toBeVisible();
  for (const [i, v] of REGRET_ANSWERS.entries()) {
    await page.locator(`input[name="Q${i}"][value="${v - 1}"]`).check();
  }
  await page.locator("#jspsych-survey-likert-next").click();
  // 10. end form: every question but the feedback box is required (each offers "Prefer not to
  // say"), so an empty submit stays on the page.
  await page.locator("#jspsych-survey-html-form-next").click();
  await expect(page.locator("#age")).toBeVisible();
  await page.locator('input[name="gamble_freq_12mo"][value="Never"]').check();
  await page.locator('input[name="feedback_reliance"][value="Prefer not to say"]').check();
  await page.locator("#age").selectOption("34");
  await page.locator('input[name="gender"][value="Prefer not to say"]').check();
  await page.locator('input[name="race"][value="Other"]').check();
  await page.locator('input[name="race_other"]').fill("Robot");
  await page.locator('input[name="ethnicity"][value="Non-Hispanic"]').check();
  await page.locator("#jspsych-survey-html-form-next").click();
  // 11. debrief is on screen
  await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();
  return shown;
}

async function finish(page) {
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("All done")).toBeVisible({ timeout: 30000 });
}

async function runThroughExperiment(page, opts) {
  const shown = await runUntilDebrief(page, opts);
  await finish(page);
  return shown;
}

async function fsGet(path) {
  // "Bearer owner" is the emulator's admin token: it bypasses security rules, like the Admin SDK.
  const r = await fetch(`${FS}/${path}`, { headers: { Authorization: "Bearer owner" } });
  return { status: r.status, body: r.status === 200 ? await r.json() : null };
}

// Unwrap Firestore REST "fields" encoding into plain JS.
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

test.describe("experiment", () => {
  test("runs to the end and saves data", async ({ page }) => {
    const consoleErrors = [];
    page.on("pageerror", (e) => consoleErrors.push(String(e)));

    await page.goto(EMULATOR
      ? "/?emulator=1&condition=risky_feedback&PROLIFIC_PID=robot123&STUDY_ID=s1&SESSION_ID=sess1"
      : "/");
    await page.waitForFunction(() => window.__saver && window.__saver.uid);
    const mode = await page.evaluate(() => window.__saver.mode);
    expect(mode).toBe(EMULATOR ? "emulator" : "offline");

    // `?condition=` is honoured only in emulator runs; offline runs get a random condition.
    await runThroughExperiment(page, {
      condition: EMULATOR ? "risky_feedback" : null, quizWrongOnce: true, tabAway: true,
    });

    // No uncaught errors from the experiment itself.
    expect(consoleErrors, "uncaught page errors").toEqual([]);

    const uid = await page.evaluate(() => window.__saver.docId);
    const stats = await page.evaluate(() => window.__saver.stats);

    if (!EMULATOR) {
      // Offline: banner + download fallback, nothing else to check.
      await expect(page.locator("#data-saver-banner")).toHaveAttribute("data-kind", "offline");
      await expect(page.locator("#data-saver-fallback")).toBeVisible();
      return;
    }

    expect(stats.writes_failed).toBe(0);
    await expect(page.locator("#data-saver-fallback")).toHaveCount(0);

    // Participant document is complete and carries condition + Prolific ids.
    const p = await fsGet(`experiments/${EXPERIMENT_ID}/participants/${uid}`);
    expect(p.status).toBe(200);
    const pdoc = decodeFields(p.body.fields);
    expect(pdoc.completed).toBe(true);
    expect(CONDITIONS).toContain(pdoc.condition);
    expect(pdoc.condition).toBe("risky_feedback");
    expect(pdoc.prolific_pid).toBe("robot123");
    expect(pdoc.n_trials).toBe(nTrials(2));
    expect(typeof pdoc.full_data).toBe("string");
    const full = JSON.parse(pdoc.full_data);
    expect(full.length).toBe(pdoc.n_trials);

    // One chunk per trial (chunk_size = 1), each carrying the trial data.
    const chunks = await fsGet(`experiments/${EXPERIMENT_ID}/participants/${uid}/trials?pageSize=500`);
    expect(chunks.status).toBe(200);
    const docs = (chunks.body.documents || []).map((d) => decodeFields(d.fields));
    expect(docs.length).toBe(pdoc.n_trials);
    const trials = docs.flatMap((d) => d.trials).sort((a, b) => a.trial_index - b.trial_index);
    expect(trials.map((t) => t.trial_index)).toEqual([...Array(pdoc.n_trials).keys()]);
    expect(trials.every((t) => t.condition === pdoc.condition)).toBe(true);

    const matching = trials.find((t) => t.task === "matching");
    expect(matching.matched_x).toBe(70);
    const attract = trials.find((t) => t.task === "attractiveness");
    expect([attract.attract_r, attract.attract_s]).toEqual([7, 6]);

    // The first quiz fails on item 1, so instructions and quiz run twice.
    const views = trials.filter((t) => t.task === "feedback_instructions");
    expect(views.map((t) => t.instructions_view)).toEqual([1, 2]);
    const quiz = trials.filter((t) => t.task === "comprehension");
    expect(quiz.map((t) => [t.quiz_attempt, t.quiz_passed])).toEqual([[1, false], [2, true]]);
    expect(quiz[0].q1_correct).toBe(false);
    expect(quiz[0].quiz_n_correct).toBe(4);

    const choice = trials.find((t) => t.task === "choice");
    expect(choice.choice).toBe("risky");
    expect(choice.matched_x).toBe(70);
    const strength = trials.find((t) => t.task === "preference_strength");
    expect(strength.strength).toBe(9);
    expect(strength.risk_preference).toBe(8.5);
    const reasons = trials.find((t) => t.task === "reasons");
    expect(reasons.reasons).toBe(REASONS_TEXT);
    expect(reasons.keystrokes).toBe(REASONS_TEXT.length);
    expect(reasons.paste_attempts).toBe(1);
    const regret = trials.find((t) => t.task === "regret_scale");
    expect([1, 2, 3, 4, 5].map((i) => regret[`regret_${i}`])).toEqual(REGRET_ANSWERS);
    expect(regret.regret_score).toBe(4.8);
    const end = trials.find((t) => t.task === "end_survey");
    expect(end.response).toMatchObject({
      feedback: null, gamble_freq_12mo: "Never", feedback_reliance: "Prefer not to say", age: 34,
      gender: "Prefer not to say", race: "Other", race_other: "Robot", ethnicity: "Non-Hispanic",
    });

    // Every trial row must carry the same participant id as its participant document,
    // otherwise trials.csv and participants.csv cannot be joined in the analysis.
    expect([...new Set(trials.map((t) => t.participant_id))]).toEqual([uid]);

    // Timing: every row carries its part of the study and its tab-away counts. The robot left
    // the tab once, for ~300 ms, on the matching screen.
    for (const t of trials) expect(t.section, `section of ${t.task}`).toBe(SECTION_OF[t.task]);
    expect(trials.every((t) => Number.isInteger(t.blur_count) && Number.isInteger(t.ms_away))).toBe(true);
    const matchingRow = trials.find((t) => t.task === "matching");
    expect(matchingRow.blur_count).toBe(1);
    expect(matchingRow.ms_away).toBeGreaterThanOrEqual(250);
    expect(trials.filter((t) => t.task !== "matching").every((t) => t.blur_count === 0)).toBe(true);
    expect(pdoc.blur_count_total).toBe(1);
    expect(pdoc.ms_away_total).toBe(matchingRow.ms_away);
    // Time per part covers every part and adds up exactly to the total.
    expect(Object.keys(pdoc.section_ms).sort()).toEqual([...new Set(Object.values(SECTION_OF))].sort());
    expect(Object.values(pdoc.section_ms).reduce((a, b) => a + b, 0)).toBe(pdoc.total_ms);
    expect(pdoc.total_ms).toBe(Math.max(...trials.map((t) => t.time_elapsed)));
  });

  test("chunked writes (chunk_size > 1) save every trial", async ({ page }) => {
    test.skip(!EMULATOR, "needs the Firestore emulator");
    await page.goto("/?emulator=1&chunk_size=5&condition=safe_feedback");
    await page.waitForFunction(() => window.__saver && window.__saver.uid);
    await runThroughExperiment(page, { condition: "safe_feedback" });
    const uid = await page.evaluate(() => window.__saver.docId);
    const p = decodeFields((await fsGet(`experiments/${EXPERIMENT_ID}/participants/${uid}`)).body.fields);
    expect(p.condition).toBe("safe_feedback");
    expect(p.n_trials).toBe(nTrials(1));
    const chunks = await fsGet(`experiments/${EXPERIMENT_ID}/participants/${uid}/trials?pageSize=500`);
    const docs = (chunks.body.documents || []).map((d) => decodeFields(d.fields));
    expect(docs.length).toBe(Math.ceil(p.n_trials / 5));
    const indices = docs.flatMap((d) => d.trials).map((t) => t.trial_index).sort((a, b) => a - b);
    expect(indices).toEqual([...Array(p.n_trials).keys()]);
  });

  test("declining consent ends the study without a thank-you-for-your-data message", async ({ page }) => {
    await page.goto(EMULATOR ? "/?emulator=1" : "/");
    await page.waitForFunction(() => window.__saver && window.__saver.uid);
    await page.getByRole("button", { name: "I do not agree" }).click();
    await expect(page.getByText("You chose not to participate")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Your responses were saved")).toHaveCount(0);
  });

  test("losing the connection at the end offers the download fallback instead of hanging", async ({ page, context }) => {
    test.skip(!EMULATOR, "needs the Firestore emulator");
    test.setTimeout(120000);
    // Run the real flow up to the last click, then cut the connection before "Finish".
    await page.goto("/?emulator=1");
    await page.waitForFunction(() => window.__saver && window.__saver.uid);
    await runUntilDebrief(page);
    await context.setOffline(true);
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.locator("#data-saver-fallback")).toBeVisible({ timeout: 40000 });
    await expect(page.getByText("connection to the server was lost")).toBeVisible();
    await expect(page.getByText("Your responses were saved")).toHaveCount(0);
    await context.setOffline(false);
  });

  test("a second run in the same browser is a new participant and saves cleanly", async ({ page }) => {
    test.skip(!EMULATOR, "needs the Firestore emulator");
    test.setTimeout(120000);

    const ids = [];
    for (let run = 0; run < 2; run++) {
      // Same page/context both times: the anonymous auth session persists, exactly as it
      // does for a student testing twice in one browser or a participant who reloads.
      await page.goto("/?emulator=1&condition=choice_only&PROLIFIC_PID=rerun" + run);
      await page.waitForFunction(() => window.__saver && window.__saver.docId);
      await runThroughExperiment(page, { condition: "choice_only" });
      const info = await page.evaluate(() => ({
        uid: window.__saver.uid, docId: window.__saver.docId, stats: window.__saver.stats,
      }));
      expect(info.stats.writes_failed, "run " + run + " had failed writes").toBe(0);
      await expect(page.locator("#data-saver-fallback")).toHaveCount(0);
      ids.push(info);
    }

    expect(ids[0].uid).toBe(ids[1].uid);          // same browser, same anonymous identity
    expect(ids[0].docId).not.toBe(ids[1].docId);  // but a separate participant record

    // Both runs survive intact, with their own Prolific id and their own trials.
    for (let run = 0; run < 2; run++) {
      const p = await fsGet(`experiments/${EXPERIMENT_ID}/participants/${ids[run].docId}`);
      expect(p.status).toBe(200);
      const pdoc = decodeFields(p.body.fields);
      expect(pdoc.completed, "run " + run + " completed").toBe(true);
      expect(pdoc.prolific_pid).toBe("rerun" + run);
      expect(pdoc.condition).toBe("choice_only");
      const chunks = await fsGet(`experiments/${EXPERIMENT_ID}/participants/${ids[run].docId}/trials?pageSize=500`);
      expect((chunks.body.documents || []).length).toBe(pdoc.n_trials);
    }
  });

  test("setting a Prolific completion code does not break the test run", async ({ page }) => {
    // Regression test for the failure students hit right before launch: with a completion
    // code set, the live page redirects to Prolific, but a test run must stay put so that
    // `npm test` and CI keep passing.
    const navigations = [];
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });

    await page.goto(EMULATOR ? "/?emulator=1&cc=QA123CODE" : "/?cc=QA123CODE");
    await page.waitForFunction(() => window.__saver && window.__saver.docId);
    await runThroughExperiment(page);

    expect(navigations.some((u) => u.includes("prolific.com")), "must not navigate to Prolific").toBe(false);
    if (EMULATOR) await expect(page.getByText("QA123CODE")).toBeVisible();
  });

  test("phones and tablets are turned away before consent", async ({ browser }) => {
    const context = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await context.newPage();
    await page.goto("http://localhost:8017/?emulator=1");
    await expect(page.locator("#device-unsupported")).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: "I agree to participate" })).toHaveCount(0);

    if (EMULATOR) {
      // The turned-away visit is still recorded, so phone traffic is visible in the data.
      await page.waitForFunction(() => window.__saver && window.__saver.docId);
      const docId = await page.evaluate(() => window.__saver.docId);
      await page.evaluate(() => window.__saver._settle());
      const p = await fsGet(`experiments/${EXPERIMENT_ID}/participants/${docId}`);
      const pdoc = decodeFields(p.body.fields);
      expect(pdoc.device_supported).toBe(false);
      expect(pdoc.completed).toBe(false);
    }
    await context.close();
  });

  test("a desktop browser is not turned away", async ({ page }) => {
    await page.goto(EMULATOR ? "/?emulator=1" : "/");
    await expect(page.getByRole("button", { name: "I agree to participate" })).toBeVisible();
    await expect(page.locator("#device-unsupported")).toHaveCount(0);
  });

  test("a write the database refuses is announced on the page, not only in the console", async ({ page }) => {
    test.skip(!EMULATOR, "needs the Firestore emulator");
    // Regression test for the state a student is in when they skip publishing the rules, or
    // once test-mode rules expire: sign-in succeeds, so the page used to look perfectly
    // healthy from consent to debrief and only admitted the problem on the last screen.
    await page.goto("/?emulator=1");
    await page.waitForFunction(() => window.__saver && window.__saver.docId);
    // Emulator runs carry an informational banner; what must be absent is a failure banner.
    await expect(page.locator('#data-saver-banner[data-kind="offline"]')).toHaveCount(0);

    // Force a genuine permission-denied on a normal save path by aiming the participant
    // document at someone else's id, which the rules refuse exactly as deny-all rules would.
    await page.evaluate(async () => {
      window.__saver.docId = "someone-else-deadbeef";
      await window.__saver.updateParticipant({ blocked: true });
    });

    const banner = page.locator("#data-saver-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("data-kind", "offline");
    await expect(banner).toContainText("NOT being saved");
    await expect(banner).toContainText("permission-denied");
    await expect(banner).toContainText("2.3");
    expect(await page.evaluate(() => window.__saver.stats.writes_failed)).toBeGreaterThan(0);
  });

  test("the download fallback tells the participant where to send the file", async ({ page }) => {
    await page.goto(EMULATOR ? "/?emulator=1" : "/");
    await page.waitForFunction(() => window.__saver && window.__saver.docId);
    await page.evaluate(() => window.__saver._offerDownload(null, "[]"));
    const box = page.locator("#data-saver-fallback");
    await expect(box).toBeVisible();
    await expect(box).toContainText("@");                       // a contact address is present
    await expect(box).toContainText("you will be paid");
    await expect(box.getByRole("link")).toHaveAttribute("href", /^mailto:/);
  });

  test("security rules reject reads and writes to other participants", async ({ page }) => {
    test.skip(!EMULATOR, "needs the Firestore emulator");
    await page.goto("/?emulator=1");
    await page.waitForFunction(() => window.__saver && window.__saver.uid);

    const results = await page.evaluate(async () => {
      const s = window.__saver;
      const fb = s.fb;
      const out = {};
      const attempt = async (name, fn) => {
        try { await fn(); out[name] = "allowed"; } catch (e) { out[name] = e.code || e.message; }
      };
      await attempt("read own doc", () =>
        fb.getDoc(fb.doc(s.db, "experiments", s.opts.experiment_id, "participants", s.docId)));
      await attempt("write other participant", () =>
        fb.setDoc(fb.doc(s.db, "experiments", s.opts.experiment_id, "participants", "someone-else"), { hacked: true }));
      await attempt("write other participant trials", () =>
        fb.setDoc(fb.doc(s.db, "experiments", s.opts.experiment_id, "participants", "someone-else", "trials", "c0"), { trials: [] }));
      await attempt("write unrelated collection", () =>
        fb.setDoc(fb.doc(s.db, "spam", "doc"), { spam: true }));
      await attempt("error doc with wrong uid", () =>
        fb.addDoc(fb.collection(s.db, "experiments", s.opts.experiment_id, "errors"), { uid: "not-me", message: "x" }));
      await attempt("own chunk (should be allowed)", () =>
        fb.setDoc(fb.doc(s.db, "experiments", s.opts.experiment_id, "participants", s.docId, "trials", "chunk-test"), { trials: [{ a: 1 }] }));
      await attempt("participant doc without the run suffix", () =>
        fb.setDoc(fb.doc(s.db, "experiments", s.opts.experiment_id, "participants", s.uid), { sneaky: true }));
      await attempt("another browser's run id", () =>
        fb.setDoc(fb.doc(s.db, "experiments", s.opts.experiment_id, "participants", "someone-else-abcd1234"), { sneaky: true }));
      return out;
    });

    expect(results["read own doc"]).toBe("permission-denied");
    expect(results["write other participant"]).toBe("permission-denied");
    expect(results["write other participant trials"]).toBe("permission-denied");
    expect(results["write unrelated collection"]).toBe("permission-denied");
    expect(results["error doc with wrong uid"]).toBe("permission-denied");
    expect(results["own chunk (should be allowed)"]).toBe("allowed");
    expect(results["participant doc without the run suffix"]).toBe("permission-denied");
    expect(results["another browser's run id"]).toBe("permission-denied");
  });

  test("uncaught errors are logged to the errors collection", async ({ page }) => {
    test.skip(!EMULATOR, "needs the Firestore emulator");
    await page.goto("/?emulator=1");
    await page.waitForFunction(() => window.__saver && window.__saver.uid);
    const uid = await page.evaluate(() => window.__saver.uid);

    // Simulate a bug in a trial: an uncaught exception.
    await page.evaluate(() => {
      setTimeout(() => { throw new Error("simulated bug in trial code"); }, 0);
    });
    await page.waitForFunction(() => window.__saver.stats.errors_logged >= 1);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));

    const errs = await fsGet(`experiments/${EXPERIMENT_ID}/errors?pageSize=100`);
    const mine = (errs.body.documents || []).map((d) => decodeFields(d.fields)).filter((d) => d.uid === uid);
    expect(mine.length).toBe(1);
    expect(mine[0].message).toContain("simulated bug");
    expect(mine[0].context.kind).toBe("uncaught");
  });
});
