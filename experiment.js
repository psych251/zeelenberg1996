/*
 * Replication of Zeelenberg, Beattie, van der Pligt & de Vries (1996), Experiment 1:
 * "Consequences of regret aversion: Effects of expected feedback on risky decision making."
 *
 * Design
 *   IV (between subjects, random 1 of 3): condition = choice_only | risky_feedback | safe_feedback,
 *     i.e. whose outcome participants expect to learn whatever they choose (none / Gamble A / Gamble B).
 *   Labels: participants see "Gamble A" (the paper's gamble R, risky) and "Gamble B" (its gamble S,
 *     safe), as in the original questionnaire (M. Zeelenberg, personal communication, Oct 20, 2026).
 *     The data keep the paper's names: choice "risky" / "safe", attract_r / attract_s.
 *   DVs: choice ("risky" / "safe") on the task "choice" row (key DV); strength (1-12) and
 *     risk_preference = (+1 risky / -1 safe) x (strength - 0.5) on "preference_strength";
 *     matched_x and attract_r, attract_s (1-12) on "matching" (one screen; earlier data had the
 *     ratings on a separate "attractiveness" row); reasons on "reasons".
 *     Exploratory, after all original measures: regret_1..regret_5 (1-7) and regret_score (mean,
 *     item 5 reversed) on "regret_scale" (Schwartz et al., 2002 Regret Scale).
 *   Trials: one of each. The feedback instructions and a 5-item comprehension quiz repeat until all
 *     five answers are correct (quiz_attempt counts the tries; no cap).
 *   Randomization: condition drawn at random per participant. Gamble order and button order are
 *     fixed (A, the risky gamble, first), as in the original.
 *   Exclusions are applied in the report (writeup/replication-report.qmd), not here.
 *
 * The original questionnaire was not published. Participant-facing wording follows the paper's own
 * description of the materials (pp. 151-152), turned into the second person; f130 becomes $130.
 */

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
window.TEMPLATE_VERSION = "0.1.0";

const EXPERIMENT = {
  // Firestore path: experiments/<id>/participants/... Change it when you start a new study
  // so pilot data and real data never mix (e.g. "smith2016-pilot-a", "smith2016-final").
  id: "zeelenberg1996-pilot-a",

  // Trials per Firestore write. 1 = save every trial the moment it finishes (dropouts leave
  // partial data). The free tier allows 20,000 writes/day: with 200 participants x 100 trials
  // you would exceed it, so raise this for long trial-based tasks (e.g. 20).
  chunk_size: 1,

  // Also store the complete jsPsych dataset on the participant document at the end.
  // Costs one extra write and makes export robust; turn off if trials are very large.
  save_full_data_at_end: true,

  // Prolific: if set, participants are redirected to Prolific when they finish.
  // Leave empty for local testing or non-Prolific samples.
  prolific_completion_code: "",

  // Contact shown in consent and debrief.
  contact_email: "stanfordpsych251@gmail.com",

  // Turn away phones and tablets before consent. There are no keyboard trials, but participants
  // type their reasons and the study is meant to be taken on a computer (also set Prolific to
  // desktop only).
  requires_keyboard: true,

  // Proof of Human bot detection (docs.poh.org): the public site key from its dashboard, which
  // is meant to be embedded in the page. Empty turns it off. The tracker starts after consent,
  // never loads in test runs (?emulator=1), and sends no participant id. Risk scores are fetched
  // after data collection with scripts/poh-scores.js.
  poh_site_key: "pub-Z2xYPhR0yqVM24DUFI7V",
};

// The three between-subjects feedback conditions.
const CONDITIONS = ["choice_only", "risky_feedback", "safe_feedback"];

// True on anything with a mouse, trackpad, or stylus, including laptops with touchscreens.
// False on phones and tablets without a pointing device, which are also the devices with no
// physical keyboard. See docs/student-guide.md "Devices".
function hasFinePointer() {
  return !!(window.matchMedia && window.matchMedia("(any-pointer: fine)").matches);
}

// `?emulator=1` in the URL sends data to the local emulator instead of the real project.
// Used by `npm test`; handy for development too (start it with `npm run emulators`).
const URL_PARAMS = new URLSearchParams(window.location.search);
const USE_EMULATOR = URL_PARAMS.get("emulator") === "1";
// `?chunk_size=N` overrides the setting above; used by the test suite to exercise chunked writes.
const CHUNK_SIZE = Number(URL_PARAMS.get("chunk_size")) || EXPERIMENT.chunk_size;
// Test-only: `?cc=CODE` sets a Prolific completion code during emulator runs, so the test
// suite can check the screen a participant sees once you have set yours. Ignored in live runs.
if (USE_EMULATOR && URL_PARAMS.get("cc")) EXPERIMENT.prolific_completion_code = URL_PARAMS.get("cc");
// Test-only: `?condition=<name>` forces a feedback condition during emulator runs, so each
// condition's screens can be checked. Ignored in live runs, where assignment is always random.
const FORCED_CONDITION =
  USE_EMULATOR && CONDITIONS.includes(URL_PARAMS.get("condition")) ? URL_PARAMS.get("condition") : null;

// ---------------------------------------------------------------------------
// Stimuli
// ---------------------------------------------------------------------------
// "$70", "$69.50": how a dollar amount is shown to participants.
function money(v) {
  return "$" + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

// The two gambles as laid out in the paper (p. 151): the risky gamble (A, the paper's R) on the
// left, the safe gamble (B, the paper's S) on the right, the win line
// above the zero line. Shown as two identical cards. Before matching, X is shown as "$X";
// afterwards it is the participant's own matched value.
function gambleCards(x) {
  const sx = x === null ? "$X" : money(x);
  return `
    <div class="gambles">
      <div class="gamble-card">
        <div class="gamble-name">Gamble A</div>
        <div class="gamble-line">$130 with 35%</div>
        <div class="gamble-line">$0 with 65%</div>
      </div>
      <div class="gamble-vs">vs</div>
      <div class="gamble-card">
        <div class="gamble-name">Gamble B</div>
        <div class="gamble-line"><span class="x-value">${sx}</span> with 65%</div>
        <div class="gamble-line">$0 with 35%</div>
      </div>
    </div>`;
}

// The parts of the study, recorded as `section` on every row so the time spent on each part can
// be added up. Listed in the order participants meet them.
const SECTIONS = ["intro", "matching", "feedback_rules", "decision", "regret_scale", "about_you", "debrief"];

// What participants read about feedback before choosing (paper pp. 151-152, second person).
// The risky and safe texts are exact mirror images, so the conditions differ only in R vs S.
const FEEDBACK_TEXT = {
  choice_only:
    "You would only know the outcome of the gamble that you choose. You would not be able to " +
    "compare your outcome with the outcome of the non-chosen gamble.",
  risky_feedback:
    "You would always know the outcome of Gamble A and the outcome of the gamble you choose. " +
    "You would be able to compare your outcome with the outcome of the non-chosen gamble if you " +
    "select Gamble B, but not if you select Gamble A.",
  safe_feedback:
    "You would always know the outcome of Gamble B and the outcome of the gamble you choose. " +
    "You would be able to compare your outcome with the outcome of the non-chosen gamble if you " +
    "select Gamble A, but not if you select Gamble B.",
};

// A 12-point scale with labelled ends, as used for attractiveness and strength of preference.
function scale12(name, title, minText, maxText) {
  return {
    type: "rating", name, title, isRequired: true,
    rateMin: 1, rateMax: 12, displayMode: "buttons",
    // End labels go under the scale, so all 12 points fit on one line.
    minRateDescription: minText, maxRateDescription: maxText, rateDescriptionLocation: "bottom",
  };
}

// Proof of Human: load its tracker, tag the session with the experiment id, and save the
// tracker's session id on the participant document so that scripts/poh-scores.js can fetch
// the session's risk score later. This is the one script loaded from a CDN rather than lib/:
// the tracker is a hosted service and cannot be vendored. `poh_status` records what happened:
// "off" (no site key, or a test run), "loading", "ready", "failed_to_load" (for example blocked
// by an ad blocker) or "no_session_id".
function startProofOfHuman(saver) {
  const record = () => {
    const id = typeof window.getPOHSessionId === "function" ? window.getPOHSessionId() : null;
    saver.updateParticipant(id ? { poh_status: "ready", poh_session_id: id } : { poh_status: "no_session_id" });
  };
  // A stand-in tracker that is already on the page (the test suite defines one) is used as is.
  if (typeof window.getPOHSessionId === "function") return record();
  if (USE_EMULATOR || !EXPERIMENT.poh_site_key) return saver.updateParticipant({ poh_status: "off" });
  if (document.getElementById("poh-script")) return;
  saver.updateParticipant({ poh_status: "loading" });
  window.addEventListener("poh:ready", record, { once: true });
  const s = document.createElement("script");
  s.id = "poh-script";
  s.src = "https://cdn.poh.org/v1/poh.js";
  s.setAttribute("data-site-key", EXPERIMENT.poh_site_key);
  s.setAttribute("data-tags", EXPERIMENT.id);
  s.onerror = () => saver.updateParticipant({ poh_status: "failed_to_load" });
  document.head.appendChild(s);
}

// ---------------------------------------------------------------------------
// Boot: connect the saver first so even a crash in the first trial gets logged.
// ---------------------------------------------------------------------------
(async function main() {
  const deviceSupported = !EXPERIMENT.requires_keyboard || hasFinePointer();

  const saver = await DataSaver.init({
    experiment_id: EXPERIMENT.id,
    chunk_size: CHUNK_SIZE,
    save_full_data_at_end: EXPERIMENT.save_full_data_at_end,
    use_emulator: USE_EMULATOR,
    contact_email: EXPERIMENT.contact_email,
  });
  window.__saver = saver; // for debugging and the automated test

  // Record the device verdict on the participant document before anything else, so a
  // participant turned away below is still visible in the data rather than simply absent.
  saver.updateParticipant({ device_supported: deviceSupported, requires_keyboard: EXPERIMENT.requires_keyboard });

  if (!deviceSupported) {
    document.body.innerHTML =
      '<div id="device-unsupported" class="jspsych-content" style="max-width:640px;margin:15vh auto;font:16px/1.6 system-ui,sans-serif;">' +
      "<h2>Please use a computer</h2>" +
      "<p>This study needs a computer with a physical keyboard, because part of it is answered " +
      "by typing. Phones and tablets cannot be used.</p>" +
      "<p>Please reopen this link on a laptop or desktop computer. If you were sent here from " +
      "Prolific, you can return the study and take it later on a computer; nothing has been recorded " +
      "against you.</p>" +
      "<p>Questions: <a href=\"mailto:" + EXPERIMENT.contact_email + "\">" + EXPERIMENT.contact_email + "</a></p></div>";
    return;
  }

  // Tab-away tracking. jsPsych reports every time the window loses ("blur") or regains ("focus")
  // focus, e.g. when the participant switches tab or app. Counted per screen and in total.
  let away = { count: 0, ms: 0, since: null };
  const awayTotal = { count: 0, ms: 0 };

  const jsPsych = initJsPsych({
    show_progress_bar: true,
    auto_update_progress_bar: true,
    on_trial_start: () => {
      // Restart the fade-in on the (reused) content element for every new screen.
      const content = document.querySelector(".jspsych-content");
      if (content) {
        content.classList.remove("screen-in");
        void content.offsetWidth;
        content.classList.add("screen-in");
      }
    },
    on_interaction_data_update: (record) => {
      if (record.event === "blur") {
        away.count += 1;
        away.since = record.time;
      } else if (record.event === "focus" && away.since !== null) {
        away.ms += record.time - away.since;
        away.since = null;
      }
    },
    // Runs before on_data_update, so these fields reach both the per-trial saves and full_data.
    on_trial_finish: (data) => {
      data.blur_count = away.count;
      data.ms_away = Math.round(away.ms);
      awayTotal.count += away.count;
      awayTotal.ms += away.ms;
      away = { count: 0, ms: 0, since: away.since };
    },
    on_data_update: (trial) => saver.onTrial(trial),
    on_finish: async () => {
      // Time per part of the study. Each screen runs from the end of the previous one to its own
      // end (time_elapsed), so the parts add up exactly to total_ms.
      const sectionMs = {};
      let previous = 0;
      for (const row of jsPsych.data.get().values()) {
        const key = row.section || "other";
        sectionMs[key] = (sectionMs[key] || 0) + (row.time_elapsed - previous);
        previous = row.time_elapsed;
      }
      saver.updateParticipant({
        section_ms: sectionMs,
        total_ms: previous,
        blur_count_total: awayTotal.count,
        ms_away_total: Math.round(awayTotal.ms),
      });

      const el = jsPsych.getDisplayElement();
      el.innerHTML = '<div id="finish-message"><p class="thanks">Saving your responses…</p></div>';
      // finish() flushes remaining trials, marks the participant complete, and (only if
      // saving failed) appends a download-fallback box to the display element.
      const result = await saver.finish(jsPsych);
      const consentRow = jsPsych.data.get().filter({ task: "consent" }).values()[0];
      const consented = !consentRow || consentRow.consented !== false;
      const msg = document.getElementById("finish-message");

      if (!consented) {
        msg.innerHTML = "<h2 class='thanks'>Thank you</h2><p class='thanks'>You chose not to participate. " +
          "You may close this window" + (EXPERIMENT.prolific_completion_code ? " and return the study on Prolific" : "") + ".</p>";
        return;
      }
      if (result.ok && EXPERIMENT.prolific_completion_code && !USE_EMULATOR) {
        msg.innerHTML = "<p class='thanks'>Saved. Returning you to Prolific…</p>";
        window.location.href =
          "https://app.prolific.com/submissions/complete?cc=" + EXPERIMENT.prolific_completion_code;
        return;
      }
      // In emulator/test runs we stay on the page instead of navigating to Prolific, so that
      // setting a completion code can never turn `npm test` or CI red. Live runs redirect above.
      msg.innerHTML =
        (result.ok ? "<div class='illustration'>" + window.ILLUSTRATIONS.sent + "</div>" : "") +
        "<h2 class='thanks'>All done</h2>" +
        (result.ok ? "<p class='thanks'>Your responses were saved. Thank you for participating!</p>" : "") +
        (EXPERIMENT.prolific_completion_code
          ? "<p class='thanks'>Your completion code is <strong>" + EXPERIMENT.prolific_completion_code + "</strong>.</p>"
          : "");
      if (result.ok) window.celebrate();
    },
  });

  // Record the participant id and URL parameters on every trial row.
  jsPsych.data.addProperties({
    // Must be the run-scoped document id, so trial rows join to participants.csv on export.
    participant_id: saver.docId,
    prolific_pid: saver.params.PROLIFIC_PID || null,
    experiment_id: EXPERIMENT.id,
  });

  // Random assignment to a feedback condition, recorded on every trial and on the participant
  // document. (For exact counterbalancing you would need a server; random assignment is fine at
  // course sample sizes.)
  const condition = FORCED_CONDITION || jsPsych.randomization.sampleWithoutReplacement(CONDITIONS, 1)[0];
  jsPsych.data.addProperties({ condition: condition });
  saver.updateParticipant({ condition: condition });

  // Responses that later screens depend on.
  let matchedX = null;    // the participant's X from the matching task
  let chosen = null;      // "risky" or "safe"
  let quizAttempt = 0;

  // -------------------------------------------------------------------------
  // 1. Consent (course-wide IRB text; edit only the contact address)
  // -------------------------------------------------------------------------
  // "I do not agree" on the left, "I agree to participate" on the right. Consent is read from the
  // button's label, not its position, so reordering the buttons can never flip the answer.
  const CONSENT_CHOICES = ["I do not agree", "I agree to participate"];
  const consent = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="consent">
        <h2>Consent</h2>
        <p>By answering the following questions, you are participating in a study being performed by
        cognitive scientists in the Stanford Department of Psychology. If you have questions about
        this research, please contact us at <a href="mailto:${EXPERIMENT.contact_email}">${EXPERIMENT.contact_email}</a>.
        You must be at least 18 years old to participate. Your participation in this research is
        voluntary. You may decline to answer any or all of the following questions. You may decline
        further participation, at any time, without adverse consequences. Your anonymity is assured;
        the researchers who have requested your participation will not receive any personal
        information about you.</p>
      </div>`,
    choices: CONSENT_CHOICES,
    data: { task: "consent", section: "intro" },
    on_finish: (data) => {
      data.consented = CONSENT_CHOICES[data.response] === "I agree to participate";
      if (!data.consented) {
        // No end message here: jsPsych would paint it over the screen that on_finish renders.
        jsPsych.abortExperiment();
      } else {
        // Bot detection starts only once the participant has agreed to take part.
        startProofOfHuman(saver);
      }
    },
  };

  // -------------------------------------------------------------------------
  // 2. Welcome
  // -------------------------------------------------------------------------
  const welcome = {
    type: jsPsychInstructions,
    pages: [
      `<div class="illustration">${window.ILLUSTRATIONS.welcome}</div>
       <h2>Welcome</h2>
       <p>In this study you will consider two gambles and answer some questions about them. The
       gambles are hypothetical: no real money is involved, but please answer as if it were.</p>
       <p>There are no right or wrong answers; we are interested in your own preferences. The study
       takes about seven minutes. Please complete it in one sitting, on a laptop or desktop computer.</p>`,
    ],
    show_clickable_nav: true,
    data: { task: "instructions", section: "intro" },
  };

  // -------------------------------------------------------------------------
  // 3. Matching (original phase 1) and attractiveness ratings, on one screen
  // -------------------------------------------------------------------------
  // The participant types X and clicks "Update X" (or presses Enter): the Gamble B card then shows
  // that amount, and the two attractiveness ratings appear below. Updating X to a new value after
  // rating clears the ratings, so the saved ratings always refer to the saved X. Continue needs
  // both ratings and the X on the card to match the box. Recorded on the "matching" row:
  // matched_x (final X), attract_r / attract_s (Gamble A / Gamble B, 1-12), x_updates (clicks
  // that showed a valid X), x_history (each X shown, in order) and ratings_reset (times the
  // ratings were cleared because X changed).
  let xUpdates = 0;
  let xHistory = [];
  let ratingsReset = 0;
  const matching = {
    type: jsPsychSurvey,
    survey_json: {
      showQuestionNumbers: "off",
      completeText: "Continue",
      textUpdateMode: "onTyping",
      pages: [{
        elements: [
          // Plain-language explanation around the paper's question (added for online participants;
          // listed as a difference from the original). Deliberately no example values for X.
          { type: "html", name: "gambles", html: `<div class="gamble-page"><p>Consider the following two gambles. In each one, you either win the amount shown or win nothing, with the chances shown.</p>${gambleCards(null)}</div>` },
          {
            type: "text", name: "x", inputType: "number", isRequired: true,
            title: "Make Gamble B exactly as attractive as Gamble A: write down the value of X for which you find the gambles equally attractive.",
            description: "X is an amount of money that you choose. Pick the amount that would make you " +
              "equally happy to play either gamble, so you would not mind which one you got. There is " +
              "no right or wrong answer. Enter an amount in dollars and click Update X.",
            validators: [
              // X must lie strictly between $0 and $130, so that neither gamble simply dominates
              // the other. (The paper set no range.)
              { type: "expression", expression: "{x} > 0 and {x} < 130",
                text: "Please enter an amount more than $0 and less than $130." },
              // The amount in the box must be the one shown on the card (and rated).
              { type: "expression", expression: "{x} = {x_shown}",
                text: "Click Update X to show this amount on Gamble B before continuing." },
            ],
          },
          { type: "html", name: "update_x",
            html: '<div class="update-x-row"><button type="button" class="jspsych-btn update-x">Update X</button>' +
              '<p class="x-note" aria-live="polite"></p></div>' },
          { type: "html", name: "rate_intro", visibleIf: "{x_shown} notempty",
            html: "<p>Rate the attractiveness of each option on a scale ranging from not attractive (1) to very attractive (12).</p>" },
          { ...scale12("attract_r", "Gamble A", "not attractive", "very attractive"), visibleIf: "{x_shown} notempty" },
          { ...scale12("attract_s", "Gamble B", "not attractive", "very attractive"), visibleIf: "{x_shown} notempty" },
        ],
      }],
    },
    survey_function: (survey) => {
      let note = "";
      // SurveyJS redraws questions (to show errors, or when the ratings appear), so the card and
      // the note are re-applied from state after every render.
      const sync = () => {
        const shown = survey.getVariable("x_shown");
        const card = document.querySelector(".jspsych-content .x-value");
        if (card) card.textContent = shown === undefined || shown === null ? "$X" : money(Number(shown));
        const noteEl = document.querySelector(".jspsych-content .x-note");
        if (noteEl) noteEl.textContent = note;
      };
      const updateX = () => {
        const xq = survey.getQuestionByName("x");
        const prev = survey.getVariable("x_shown");
        const value = survey.getValue("x");
        // Show the new value first, so only the range check can fail; put the old one back if it does.
        survey.setVariable("x_shown", value);
        if (!xq.validate(true)) {
          survey.setVariable("x_shown", prev);
          sync();
          return;
        }
        const x = Number(value);
        note = "";
        const rated = survey.getValue("attract_r") !== undefined || survey.getValue("attract_s") !== undefined;
        if (prev !== undefined && prev !== null && Number(prev) !== x && rated) {
          survey.clearValue("attract_r");
          survey.clearValue("attract_s");
          ratingsReset += 1;
          note = "Your ratings were cleared because X changed. Please rate the gambles again.";
        }
        xUpdates += 1;
        xHistory.push(x);
        sync();
      };
      survey.onAfterRenderQuestion.add((_, options) => {
        const name = options.question.name;
        if (name === "update_x") {
          const btn = options.htmlElement.querySelector(".update-x");
          if (btn && !btn.dataset.bound) {
            btn.dataset.bound = "on";
            btn.addEventListener("click", updateX);
          }
        }
        if (name === "x") {
          const box = options.htmlElement.querySelector("input");
          if (box && !box.dataset.bound) {
            box.dataset.bound = "on";
            // Enter updates X instead of doing anything else.
            box.addEventListener("keydown", (e) => {
              if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); updateX(); }
            });
          }
        }
        sync();
      });
    },
    data: { task: "matching", section: "matching" },
    on_finish: (data) => {
      matchedX = Number(data.response.x);
      data.matched_x = matchedX;
      data.attract_r = data.response.attract_r;
      data.attract_s = data.response.attract_s;
      data.x_updates = xUpdates;
      data.x_history = xHistory;
      data.ratings_reset = ratingsReset;
    },
  };

  // -------------------------------------------------------------------------
  // 4. Feedback instructions + comprehension quiz, repeated until all 5 answers are correct
  // -------------------------------------------------------------------------
  // After a failed quiz the same page is shown again with a notice on top. (A separate notice
  // trial would leave a gap in trial_index whenever it is skipped.)
  const feedbackInstructions = {
    type: jsPsychHtmlButtonResponse,
    stimulus: () => `
      <div class="gamble-page" data-condition="${condition}">
        ${quizAttempt > 0
          ? '<p class="quiz-retry">Some of your answers were incorrect. Please read the instructions again.</p>'
          : ""}
        <p>Although you have made the gambles equally attractive, you are required to choose
        between them.</p>
        ${gambleCards(matchedX)}
        <p>Before you choose, please note:</p>
        <p class="feedback-rule">${FEEDBACK_TEXT[condition]}</p>
      </div>`,
    choices: ["Continue"],
    data: { task: "feedback_instructions", section: "feedback_rules" },
    on_finish: (data) => {
      data.instructions_view = quizAttempt + 1; // 1 = first reading, 2+ = after a failed quiz
    },
  };

  // Correct answers. Items 4 and 5 depend on the condition: only the gamble whose outcome is
  // always shown is learned when the other one is chosen.
  const QUIZ_KEY = {
    q1: "35",
    q2: "65",
    q3: "yes",
    q4: condition === "safe_feedback" ? "yes" : "no",
    q5: condition === "risky_feedback" ? "yes" : "no",
  };
  const yesNo = [{ value: "yes", text: "Yes" }, { value: "no", text: "No" }];
  const quiz = {
    type: jsPsychSurvey,
    survey_json: () => ({
      showQuestionNumbers: "on",
      completeText: "Check my answers",
      pages: [{
        elements: [
          { type: "html", name: "intro", html: "<p>Before you choose, please answer these questions.</p>" },
          {
            type: "radiogroup", name: "q1", isRequired: true,
            title: "What is the chance of winning $130 with Gamble A?",
            choices: [{ value: "35", text: "35%" }, { value: "65", text: "65%" }],
          },
          {
            type: "radiogroup", name: "q2", isRequired: true,
            title: `What is the chance of winning ${money(matchedX)} with Gamble B?`,
            choices: [{ value: "65", text: "65%" }, { value: "35", text: "35%" }],
          },
          { type: "radiogroup", name: "q3", isRequired: true, choices: yesNo,
            title: "Would you know the outcome of the gamble you choose?" },
          { type: "radiogroup", name: "q4", isRequired: true, choices: yesNo,
            title: "If you choose Gamble A, would you know the outcome of Gamble B?" },
          { type: "radiogroup", name: "q5", isRequired: true, choices: yesNo,
            title: "If you choose Gamble B, would you know the outcome of Gamble A?" },
        ],
      }],
    }),
    data: { task: "comprehension", section: "feedback_rules" },
    on_finish: (data) => {
      quizAttempt += 1;
      data.quiz_attempt = quizAttempt;
      let nCorrect = 0;
      for (const q of Object.keys(QUIZ_KEY)) {
        data[q + "_correct"] = data.response[q] === QUIZ_KEY[q];
        if (data[q + "_correct"]) nCorrect += 1;
      }
      data.quiz_n_correct = nCorrect;
      data.quiz_passed = nCorrect === Object.keys(QUIZ_KEY).length;
    },
  };

  const lastQuizPassed = () =>
    jsPsych.data.get().filter({ task: "comprehension" }).last(1).values()[0].quiz_passed;

  const comprehensionLoop = {
    timeline: [feedbackInstructions, quiz],
    loop_function: () => !lastQuizPassed(),
  };

  // -------------------------------------------------------------------------
  // 5. Choice (key DV), with the feedback rule still in view
  // -------------------------------------------------------------------------
  const choice = {
    type: jsPsychHtmlButtonResponse,
    stimulus: () => `
      <div class="gamble-page" data-condition="${condition}">
        ${gambleCards(matchedX)}
        <p class="feedback-rule">${FEEDBACK_TEXT[condition]}</p>
        <p><strong>Which gamble do you choose?</strong></p>
      </div>`,
    choices: ["Gamble A", "Gamble B"],
    data: { task: "choice", section: "decision" },
    on_finish: (data) => {
      // Button order is fixed: 0 = Gamble A (risky), 1 = Gamble B (safe).
      chosen = data.response === 0 ? "risky" : "safe";
      data.choice = chosen;
      data.matched_x = matchedX;
    },
  };

  // -------------------------------------------------------------------------
  // 6. Strength of preference
  // -------------------------------------------------------------------------
  const strength = {
    type: jsPsychSurvey,
    survey_json: () => ({
      showQuestionNumbers: "off",
      completeText: "Continue",
      pages: [{
        elements: [
          { type: "html", name: "chosen", html: `<p>You chose <strong>Gamble ${chosen === "risky" ? "A" : "B"}</strong>.</p>` },
          scale12("strength",
            "Indicate the strength of your preference for the chosen option on a 12-point scale ranging from weak preference (1) to strong preference (12).",
            "weak preference", "strong preference"),
        ],
      }],
    }),
    data: { task: "preference_strength", section: "decision" },
    on_finish: (data) => {
      data.strength = data.response.strength;
      data.choice = chosen;
      // The paper's risk-preference score (p. 152): -11.5 = extreme risk aversion, 11.5 = extreme risk seeking.
      data.risk_preference = (chosen === "risky" ? 1 : -1) * (data.strength - 0.5);
    },
  };

  // -------------------------------------------------------------------------
  // 7. Reasons. Pasting, dropping, copying and cutting text are blocked in the answer box, so an
  //    answer written elsewhere (e.g. by a chatbot) cannot simply be pasted in. Blocked attempts
  //    and keystrokes are counted.
  // -------------------------------------------------------------------------
  // The answer must be at least MIN_REASON_CHARS characters long, not counting spaces at the start
  // or end. (The original set no minimum; this is a deviation for data quality.)
  const MIN_REASON_CHARS = 30;
  let pasteAttempts = 0;
  let keystrokes = 0;
  let tooShortAttempts = 0;   // clicks on Continue that were refused (empty or too short)
  const reasons = {
    type: jsPsychSurvey,
    survey_json: {
      showQuestionNumbers: "off",
      completeText: "Continue",
      pages: [{
        elements: [
          { type: "comment", name: "reasons", isRequired: true, rows: 4,
            title: "Write down the reasons for your choice." },
        ],
      }],
    },
    survey_function: (survey) => {
      // Minimum length. An empty box already gets SurveyJS's own "Response required".
      survey.onValidateQuestion.add((_, options) => {
        if (options.name !== "reasons") return;
        const chars = String(options.value || "").trim().length;
        if (chars > 0 && chars < MIN_REASON_CHARS) {
          options.error = `Please write at least ${MIN_REASON_CHARS} characters.`;
        }
      });
      // Counted once per refused click on Continue.
      survey.onValidatedErrorsOnCurrentPage.add((_, options) => {
        if (options.errors.length > 0) tooShortAttempts += 1;
      });
      // Runs again if SurveyJS redraws the question (e.g. to show "Response required").
      survey.onAfterRenderQuestion.add((_, options) => {
        if (options.question.name !== "reasons") return;
        const box = options.htmlElement.querySelector("textarea");
        if (!box || box.dataset.pasteGuard) return;
        box.dataset.pasteGuard = "on";
        const note = document.createElement("div");
        note.className = "paste-note";
        note.textContent = "Pasting is turned off for this question. Please type your answer.";
        note.hidden = true;
        box.insertAdjacentElement("afterend", note);
        const blockInsert = (e) => {
          e.preventDefault();
          pasteAttempts += 1;
          note.hidden = false;
        };
        box.addEventListener("paste", blockInsert);
        box.addEventListener("drop", blockInsert);
        box.addEventListener("copy", (e) => e.preventDefault());
        box.addEventListener("cut", (e) => e.preventDefault());
        box.addEventListener("keydown", () => { keystrokes += 1; });
      });
    },
    data: { task: "reasons", section: "decision" },
    on_finish: (data) => {
      data.reasons = data.response.reasons;
      data.reasons_chars = String(data.reasons || "").trim().length;
      data.too_short_attempts = tooShortAttempts;
      data.paste_attempts = pasteAttempts;
      data.keystrokes = keystrokes;
    },
  };

  // -------------------------------------------------------------------------
  // 8. Choice Regret Scale (Schwartz et al., 2002). Exploratory; not part of the original study,
  //    so it comes after every original measure. Item 5 is reverse-scored.
  // -------------------------------------------------------------------------
  const REGRET_ITEMS = [
    "Whenever I make a choice, I'm curious about what would have happened if I had chosen differently.",
    "Whenever I make a choice, I try to get information about how the other alternatives turned out.",
    "If I make a choice and it turns out well, I still feel like something of a failure if I find out that another choice would have turned out better.",
    "When I think about how I'm doing in life, I often assess opportunities I have passed up.",
    "Once I make a decision, I don't look back.",
  ];
  const regretScale = {
    type: jsPsychSurveyLikert,
    preamble: "<p>Please read each statement and indicate how much you agree with it, from 1 " +
      "(completely disagree) to 7 (completely agree). There are no right or wrong answers.</p>",
    questions: REGRET_ITEMS.map((prompt, i) => ({
      prompt, name: `regret_${i + 1}`, required: true,
      labels: ["1<br>Completely disagree", "2", "3", "4", "5", "6", "7<br>Completely agree"],
    })),
    button_label: "Continue",
    data: { task: "regret_scale", section: "regret_scale" },
    on_finish: (data) => {
      // The plugin records the label index (0-6); store the 1-7 scale value.
      const items = REGRET_ITEMS.map((_, i) => data.response[`regret_${i + 1}`] + 1);
      items.forEach((v, i) => { data[`regret_${i + 1}`] = v; });
      const scored = items.map((v, i) => (i === 4 ? 8 - v : v)); // reverse-score item 5
      data.regret_score = scored.reduce((a, b) => a + b, 0) / scored.length;
    },
  };

  // -------------------------------------------------------------------------
  // 9. End form: feedback (optional), gambling history, demographics. Each of the other questions
  //     must be answered, but always offers "Prefer not to say", as the consent text promises.
  // -------------------------------------------------------------------------
  const PREFER_NOT = "Prefer not to say";
  const radios = (name, options) =>
    options.map((o) => `<label><input type="radio" name="${name}" value="${o}" required> ${o}</label>`).join("");
  const ageOptions = ['<option value="" selected disabled>Select…</option>']
    .concat(Array.from({ length: 83 }, (_, i) => `<option value="${i + 18}">${i + 18}</option>`))
    .concat([`<option value="${PREFER_NOT}">${PREFER_NOT}</option>`])
    .join("");

  const endSurvey = {
    type: jsPsychSurveyHtmlForm,
    preamble: "<p>Please answer a few last questions.</p>",
    html: `
      <div class="end-form">
        <div class="item">
          <label for="feedback"><strong>Feedback</strong></label>
          <textarea name="feedback" id="feedback" rows="4"
            placeholder="Please provide any feedback you have about the study."></textarea>
        </div>

        <div class="item">
          <div><strong>In the past 12 months, how often have you gambled</strong> (for example at a
          casino, the lottery, sports betting, or scratch cards)?</div>
          ${radios("gamble_freq_12mo", ["Never", "A few times", "About once a month", "About once a week",
            "Daily or almost daily", PREFER_NOT])}
        </div>

        <div class="item">
          <div><strong>How much did the information about which outcomes you would learn influence
          your choice?</strong></div>
          ${radios("feedback_reliance", ["Not at all", "Somewhat", "A lot", PREFER_NOT])}
        </div>

        <div class="item">
          <label for="age"><strong>Age</strong></label>
          <select name="age" id="age" required>${ageOptions}</select>
        </div>

        <div class="item">
          <div><strong>Gender</strong></div>
          ${radios("gender", ["Female", "Male", "Non-binary", "Other", PREFER_NOT])}
          <label>If other, please specify: <input type="text" name="gender_other" style="width:50%;"></label>
        </div>

        <div class="item">
          <div><strong>Race</strong></div>
          ${radios("race", ["White", "Black/African American", "American Indian/Alaska Native", "Asian",
            "Native Hawaiian/Pacific Islander", "Multiracial/Mixed", "Other", PREFER_NOT])}
          <label>If other, please specify: <input type="text" name="race_other" style="width:50%;"></label>
        </div>

        <div class="item">
          <div><strong>Ethnicity</strong></div>
          ${radios("ethnicity", ["Hispanic", "Non-Hispanic", PREFER_NOT])}
        </div>
      </div>`,
    button_label: "Continue",
    data: { task: "end_survey", section: "about_you" },
    on_finish: (data) => {
      // "Other" text is kept in its own field. Age is a number, or "Prefer not to say".
      const r = data.response;
      const text = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
      const age = parseInt(r.age, 10);
      data.response = {
        feedback: text(r.feedback),
        gamble_freq_12mo: r.gamble_freq_12mo ?? null,
        feedback_reliance: r.feedback_reliance ?? null,
        age: Number.isNaN(age) ? (r.age || null) : age,
        gender: r.gender ?? null,
        gender_other: text(r.gender_other),
        race: r.race ?? null,
        race_other: text(r.race_other),
        ethnicity: r.ethnicity ?? null,
      };
    },
  };

  // -------------------------------------------------------------------------
  // 10. Debrief
  // -------------------------------------------------------------------------
  const debrief = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="illustration">${window.ILLUSTRATIONS.thanks}</div>
      <h2>Thank You!</h2>
      <p>Thank you for taking part. This study tested whether knowing which outcomes you will
      learn after a decision changes which option people choose.</p>
      <p>The gambles were hypothetical, so neither gamble was played and there is no outcome to
      show you. If you have questions about this research, contact
      <a href="mailto:${EXPERIMENT.contact_email}">${EXPERIMENT.contact_email}</a>.</p>
      <p><strong>Press the button to save your responses and finish.</strong></p>`,
    choices: ["Finish"],
    data: { task: "debrief", section: "debrief" },
    // Every question is answered by now, and every participant sees this screen (once a Prolific
    // code is set, real participants go straight from "Saving…" to Prolific and never see "All done").
    on_load: () => window.celebrate(),
  };

  await jsPsych.run([
    consent,
    welcome,
    matching,
    comprehensionLoop,
    choice,
    strength,
    reasons,
    regretScale,
    endSurvey,
    debrief,
  ]);
})();
