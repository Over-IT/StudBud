/**
 * NEXUS STUDENT HUB
 * FILE: flashcardEngine.js (7 of 9)
 * DESCRIPTION: Spaced Repetition (Anki's SM-2 scheduler: new/learning/review/relearning, ease, fuzz, leeches,
 * daily limits and session queue), Bayesian Knowledge Tracing (BKT),
 * Strict Context-Linked Hierarchy Bus, and Multi-Format Convertible Exporter.
 */

(function (global) {
    'use strict';

    // ============================================================================
    // 1. CONTEXT-LINKED HIERARCHY BUS
    // ============================================================================
    class ContextLinkedHierarchyBus {
        /**
         * Enforces strict entity linking: Course -> Semester -> Unit -> Target Exam -> Deck
         */
        static validateAndLink(deck, context) {
            const requiredKeys = ['course', 'semester', 'unit', 'targetExam'];
            const missing = requiredKeys.filter(k => !context[k]);
            
            if (missing.length > 0) {
                console.warn(`[Hierarchy Bus] Strict linking failed. Missing entities: ${missing.join(', ')}`);
                deck.isOrphaned = true;
                deck.hierarchyPath = 'Unlinked / Orphaned Deck';
                return false;
            }

            deck.contextLink = {
                courseId: context.course.id || context.course,
                semesterId: context.semester.id || context.semester,
                unitId: context.unit.id || context.unit,
                targetExamId: context.targetExam.id || context.targetExam
            };

            deck.hierarchyPath = `${context.course} > ${context.semester} > ${context.unit} > ${context.targetExam}`;
            deck.isOrphaned = false;
            return true;
        }

        static getHierarchyString(deck) {
            return deck.hierarchyPath || 'Unlinked Deck';
        }
    }

    // ============================================================================
    // 2. ANKI SM-2 SCHEDULER (Anki's v2/v3 "SM-2" scheduler with Anki's default deck options)
    // ============================================================================
    const MINUTE = 60000;
    const HOUR = 3600000;
    const DAY_MS = 86400000;
    const CARD_STATES = ['new', 'learning', 'review', 'relearning'];

    class SM2Engine {
        static DAY = DAY_MS;
        static SCHEDULER_VERSION = 'anki-sm2';
        static STATES = CARD_STATES;

        // Anki's default deck options
        static DEFAULTS = Object.freeze({
            learningSteps: [1, 10],      // minutes
            graduatingInterval: 1,       // days
            easyInterval: 4,             // days
            relearningSteps: [10],       // minutes
            minimumInterval: 1,          // days, interval floor after a lapse
            startingEase: 2.5,
            minimumEase: 1.3,
            easyBonus: 1.3,
            hardMultiplier: 1.2,
            intervalModifier: 1.0,
            newIntervalMultiplier: 0.0,
            maximumInterval: 36500,      // days
            leechThreshold: 8,           // lapses
            newCardsPerDay: 20,
            reviewsPerDay: 200,
            learnAheadMinutes: 20,
            dayRolloverHour: 4           // Anki's "next day starts at" (local time)
        });

        // Quality values match the app's buttons; 0-2 all mean Again so older 0-5 callers keep working
        static BUTTONS = Object.freeze([
            Object.freeze({ key: 'again', label: 'Again', quality: 1 }),
            Object.freeze({ key: 'hard', label: 'Hard', quality: 3 }),
            Object.freeze({ key: 'good', label: 'Good', quality: 4 }),
            Object.freeze({ key: 'easy', label: 'Easy', quality: 5 })
        ]);

        static #options = { ...SM2Engine.DEFAULTS };

        static get options() { return SM2Engine.#options; }

        /** Override any of the DEFAULTS (e.g. { newCardsPerDay: 30 }). Pass nothing to reset. */
        static configure(overrides = null) {
            SM2Engine.#options = overrides ? { ...SM2Engine.#options, ...overrides } : { ...SM2Engine.DEFAULTS };
            return SM2Engine.#options;
        }

        static resolveOptions(options = {}) {
            const base = SM2Engine.#options;
            const merged = options && options.config ? { ...base, ...options.config } : base;
            return merged;
        }

        // --- Day handling: like Anki, review days roll over at 4am local time ------------------------
        static dayNumber(ts, cfg = SM2Engine.#options) {
            const d = new Date(ts - cfg.dayRolloverHour * HOUR);
            return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
        }

        static dayStart(day, cfg = SM2Engine.#options) {
            const u = new Date(day * DAY_MS);
            return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), cfg.dayRolloverHour).getTime();
        }

        // --- Answer buttons --------------------------------------------------------------------------
        /** Returns 1 = Again, 2 = Hard, 3 = Good, 4 = Easy. Accepts 0-5 quality numbers or button names. */
        static toButton(q) {
            if (typeof q === 'string') {
                const named = { again: 1, hard: 2, good: 3, easy: 4 }[q.trim().toLowerCase()];
                if (named) return named;
                q = Number(q);
            }
            if (!Number.isInteger(q) || q < 0 || q > 5) {
                throw new RangeError('Review quality must be an integer from 0 through 5 or one of again/hard/good/easy.');
            }
            return q <= 2 ? 1 : q - 1;
        }

        // --- Migration of stored progress ------------------------------------------------------------
        /**
         * Returns a copy of the card with valid Anki SM-2 fields. Handles cards saved by the original
         * SM-2 code (repetitions/interval/easeFactor only), by the FSRS build (state/step/stability), and new cards.
         */
        static normalize(card, cfg = SM2Engine.#options) {
            const c = { ...(card || {}) };
            let ease = Number(c.easeFactor);
            if (!Number.isFinite(ease) || ease <= 0) ease = cfg.startingEase;
            else if (ease > 100) ease /= 1000;   // Anki permille (2500)
            else if (ease > 10) ease /= 100;     // percent (250)
            c.easeFactor = Math.round(Math.max(cfg.minimumEase, ease) * 1000) / 1000;

            const int = value => Math.max(0, Math.round(Number(value) || 0));
            c.interval = int(c.interval);
            c.lapses = int(c.lapses);
            c.repetitions = int(c.repetitions);
            c.reps = Number.isFinite(Number(c.reps)) && c.reps !== null && c.reps !== '' ? int(c.reps) : c.repetitions + c.lapses;
            c.leech = Boolean(c.leech);

            const lastMs = c.lastReviewed ? Date.parse(c.lastReviewed) : NaN;
            const dueMs = c.nextReviewDate ? Date.parse(c.nextReviewDate) : NaN;
            if (!CARD_STATES.includes(c.state)) {
                if (!Number.isFinite(lastMs) && c.interval < 1 && c.repetitions < 1) c.state = 'new';
                else if (c.interval >= 1 || (Number.isFinite(lastMs) && Number.isFinite(dueMs) && dueMs - lastMs >= DAY_MS / 2)) c.state = 'review';
                else c.state = 'learning';
            }

            if (c.state === 'new') {
                c.step = 0;
                c.interval = 0;
            } else if (c.state === 'review') {
                c.step = 0;
                if (c.interval < 1) {
                    const span = Number.isFinite(lastMs) && Number.isFinite(dueMs) ? Math.round((dueMs - lastMs) / DAY_MS) : 0;
                    c.interval = Math.max(1, span);
                }
            } else {
                const steps = c.state === 'learning' ? cfg.learningSteps : cfg.relearningSteps;
                c.step = Math.min(int(c.step), Math.max(0, steps.length - 1));
                if (c.state === 'learning') c.interval = 0;
                // FSRS-era relearning cards never stored the post-lapse interval
                else if (c.interval < 1) c.interval = Math.max(1, cfg.minimumInterval);
            }
            c.interval = Math.min(c.interval, cfg.maximumInterval);
            return c;
        }

        /** Scheduling fields to Object.assign onto a stored card so it is in the current format (no review is recorded). */
        static migrate(card, cfg = SM2Engine.#options) {
            const c = SM2Engine.normalize(card, cfg);
            return {
                state: c.state,
                step: c.step,
                easeFactor: c.easeFactor,
                interval: c.interval,
                repetitions: c.repetitions,
                reps: c.reps,
                lapses: c.lapses,
                leech: c.leech,
                schedulerVersion: SM2Engine.SCHEDULER_VERSION,
                stability: undefined,
                difficulty: undefined
            };
        }

        /** Migrates every card in a deck in place. Returns true when anything changed (so the caller can save). */
        static migrateDeck(deck, cfg = SM2Engine.#options) {
            if (!deck || !Array.isArray(deck.cards)) return false;
            let changed = false;
            deck.cards.forEach(card => {
                if (card && card.schedulerVersion !== SM2Engine.SCHEDULER_VERSION) {
                    Object.assign(card, SM2Engine.migrate(card, cfg));
                    delete card.stability;
                    delete card.difficulty;
                    changed = true;
                }
            });
            return changed;
        }

        // --- Fuzz (Anki v3: same range table, seeded per card so previews match the real answer) -----
        static fuzzFactor(card) {
            const seed = `${card.id ?? card.front ?? ''}|${card.reps || 0}`;
            let h = 2166136261;
            for (let i = 0; i < seed.length; i += 1) {
                h ^= seed.charCodeAt(i);
                h = Math.imul(h, 16777619);
            }
            // mulberry32 finaliser
            let t = (h + 0x6D2B79F5) | 0;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }

        static fuzzBounds(interval, minimum, maximum) {
            minimum = Math.min(minimum, maximum);
            interval = Math.min(Math.max(interval, minimum), maximum);
            let lower, upper;
            if (interval < 2.5) {
                lower = upper = Math.round(interval);
            } else {
                let delta = 1;
                for (const [start, end, factor] of [[2.5, 7, 0.15], [7, 20, 0.1], [20, Infinity, 0.05]]) {
                    delta += factor * Math.max(Math.min(interval, end) - start, 0);
                }
                lower = Math.max(2, Math.round(interval - delta));
                upper = Math.round(interval + delta);
            }
            lower = Math.min(Math.max(lower, minimum), maximum);
            upper = Math.min(Math.max(upper, minimum), maximum);
            if (upper === lower && upper > 2 && upper < maximum) upper = lower + 1;
            return [lower, upper];
        }

        static applyFuzz(interval, minimum, maximum, factor) {
            const [lower, upper] = SM2Engine.fuzzBounds(interval, minimum, maximum);
            return Math.floor(lower + factor * (1 + upper - lower));
        }

        // Backward-compatible random fuzz of a day count
        static fuzz(days) {
            return SM2Engine.applyFuzz(days, 1, SM2Engine.#options.maximumInterval, Math.random());
        }

        static constrainInterval(interval, minimum, cfg, fuzzFactor) {
            const max = cfg.maximumInterval;
            const min = Math.min(Math.max(1, minimum), max);
            if (fuzzFactor === null) return Math.min(Math.max(Math.round(interval), min), max);
            return SM2Engine.applyFuzz(interval, min, max, fuzzFactor);
        }

        static hardStepDelay(steps, step) {
            const current = steps[step];
            if (step > 0) return current * MINUTE;
            if (steps.length > 1) return (current + steps[1]) / 2 * MINUTE;
            return Math.min(current * 1.5, current + 1440) * MINUTE;
        }

        // --- Core scheduler --------------------------------------------------------------------------
        /**
         * Full answer computation. Returns { fields, button, previousState, delayMs, days, leechTriggered }.
         * options: { now, fuzz: false (disable fuzz), config: {...overrides} }
         */
        static schedule(card, q, options = {}) {
            const cfg = SM2Engine.resolveOptions(options);
            const now = Number.isFinite(options.now) ? options.now : Date.now();
            const button = SM2Engine.toButton(q);
            const c = SM2Engine.normalize(card, cfg);
            const today = SM2Engine.dayNumber(now, cfg);
            const fuzzFactor = options.fuzz === false ? null
                : Number.isFinite(options.fuzzFactor) ? options.fuzzFactor : SM2Engine.fuzzFactor(c);
            const previousState = c.state;

            let { state, step, easeFactor: ease, interval, lapses, leech } = c;
            let delayMs = null;
            let days = null;
            let leechTriggered = false;

            const toReview = d => { state = 'review'; step = 0; days = d; interval = d; };
            const runSteps = (steps, graduateGood, graduateEasy) => {
                if (button === 4) return toReview(graduateEasy());
                if (!steps.length) return toReview(graduateGood());
                if (button === 1) { step = 0; delayMs = steps[0] * MINUTE; }
                else if (button === 2) delayMs = SM2Engine.hardStepDelay(steps, step);
                else if (step + 1 >= steps.length) toReview(graduateGood());
                else { step += 1; delayMs = steps[step] * MINUTE; }
            };

            if (state === 'new' || state === 'learning') {
                if (state === 'new') { step = 0; ease = cfg.startingEase; }
                state = 'learning';
                interval = 0;
                runSteps(cfg.learningSteps,
                    () => SM2Engine.constrainInterval(cfg.graduatingInterval, 1, cfg, fuzzFactor),
                    () => SM2Engine.constrainInterval(cfg.easyInterval, 1, cfg, fuzzFactor));
            } else if (state === 'relearning') {
                const lapseInterval = interval;
                runSteps(cfg.relearningSteps,
                    () => Math.min(lapseInterval, cfg.maximumInterval),
                    () => Math.min(lapseInterval + 1, cfg.maximumInterval));
                if (state === 'relearning') interval = lapseInterval;
            } else {
                const dueDay = c.nextReviewDate && Number.isFinite(Date.parse(c.nextReviewDate))
                    ? SM2Engine.dayNumber(Date.parse(c.nextReviewDate), cfg) : today;
                const daysLate = today - dueDay;
                if (button === 1) {
                    lapses += 1;
                    ease = Math.max(cfg.minimumEase, ease - 0.2);
                    const lapseInterval = Math.min(cfg.maximumInterval,
                        Math.max(1, cfg.minimumInterval, Math.round(interval * cfg.newIntervalMultiplier)));
                    const threshold = cfg.leechThreshold;
                    if (threshold > 0 && lapses >= threshold && (lapses - threshold) % Math.max(1, Math.ceil(threshold / 2)) === 0) {
                        leech = true;
                        leechTriggered = true;
                    }
                    if (cfg.relearningSteps.length) {
                        state = 'relearning';
                        step = 0;
                        interval = lapseInterval;
                        delayMs = cfg.relearningSteps[0] * MINUTE;
                    } else toReview(lapseInterval);
                } else {
                    const [hard, good, easy] = daysLate >= 0
                        ? SM2Engine.passingIntervals(interval, daysLate, ease, cfg, fuzzFactor)
                        : SM2Engine.earlyIntervals(interval, interval + daysLate, ease, cfg, fuzzFactor);
                    if (button === 2) ease = Math.max(cfg.minimumEase, ease - 0.15);
                    if (button === 4) ease += 0.15;
                    toReview(button === 2 ? hard : button === 3 ? good : easy);
                }
            }

            let dueAt;
            if (days !== null) dueAt = SM2Engine.dayStart(today + days, cfg);
            else if (delayMs >= DAY_MS) dueAt = SM2Engine.dayStart(today + Math.round(delayMs / DAY_MS), cfg);
            else dueAt = now + delayMs;

            const fields = {
                state,
                step,
                easeFactor: Math.round(ease * 1000) / 1000,
                interval,
                repetitions: button === 1 ? 0 : c.repetitions + 1,
                reps: c.reps + 1,
                lapses,
                leech,
                lastReviewed: new Date(now).toISOString(),
                nextReviewDate: new Date(dueAt).toISOString(),
                schedulerVersion: SM2Engine.SCHEDULER_VERSION,
                stability: undefined,
                difficulty: undefined
            };
            return { fields, button, previousState, delayMs: days !== null ? null : delayMs, days, dueAt, leechTriggered };
        }

        // Anki v3 review intervals for on-time/late answers: Hard < Good < Easy, each at least a day apart
        static passingIntervals(current, daysLate, ease, cfg, fuzzFactor) {
            const scheduled = Math.max(1, current);
            const hardMinimum = cfg.hardMultiplier <= 1 ? 0 : scheduled + 1;
            const hard = SM2Engine.constrainInterval(scheduled * cfg.hardMultiplier * cfg.intervalModifier, hardMinimum, cfg, fuzzFactor);
            const goodMinimum = cfg.hardMultiplier <= 1 ? scheduled + 1 : hard + 1;
            const good = SM2Engine.constrainInterval((scheduled + daysLate / 2) * ease * cfg.intervalModifier, goodMinimum, cfg, fuzzFactor);
            const easy = SM2Engine.constrainInterval((scheduled + daysLate) * ease * cfg.easyBonus * cfg.intervalModifier, good + 1, cfg, fuzzFactor);
            return [hard, good, easy];
        }

        // Anki v3 intervals when a review card is answered before it was due
        static earlyIntervals(scheduled, elapsed, ease, cfg, fuzzFactor) {
            scheduled = Math.max(1, scheduled);
            elapsed = Math.max(0, elapsed);
            const hard = SM2Engine.constrainInterval(Math.max(elapsed * cfg.hardMultiplier, scheduled * cfg.hardMultiplier / 2) * cfg.intervalModifier, 1, cfg, fuzzFactor);
            const good = SM2Engine.constrainInterval(Math.max(elapsed * ease, scheduled) * cfg.intervalModifier, 1, cfg, fuzzFactor);
            const reducedBonus = cfg.easyBonus - (cfg.easyBonus - 1) / 2;
            const easy = SM2Engine.constrainInterval(Math.max(elapsed * ease, scheduled) * reducedBonus * cfg.intervalModifier, 1, cfg, fuzzFactor);
            return [hard, good, easy];
        }

        /**
         * Backward-compatible entry point used by app.js: returns the card's new scheduling fields
         * (Object.assign them onto the card). Quality: 0-2 = Again, 3 = Hard, 4 = Good, 5 = Easy.
         * Pass { fuzz: false } to preview without fuzz.
         */
        static evaluate(card, q, options = {}) {
            return SM2Engine.schedule(card, q, options).fields;
        }

        // --- Interval previews for the answer buttons -----------------------------------------------
        /** Anki-style short label: "<1m", "10m", "1h", "1d", "4d", "1.5mo", "2.1y". */
        static formatInterval(seconds, days = null) {
            if (days !== null && days !== undefined) {
                if (days < 30) return `${days}d`;
                if (days < 365) return `${SM2Engine.trimNumber(days / 30)}mo`;
                return `${SM2Engine.trimNumber(days / 365)}y`;
            }
            if (seconds <= 60) return '<1m';
            if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
            if (seconds < 86400) return `${SM2Engine.trimNumber(seconds / 3600)}h`;
            return SM2Engine.formatInterval(0, Math.round(seconds / 86400));
        }

        static trimNumber(value) {
            return String(Math.round(value * 10) / 10);
        }

        /** Label for one button's next interval, e.g. getIntervalLabel(card, 4) -> "10m". */
        static getIntervalLabel(card, q, options = {}) {
            const r = SM2Engine.schedule(card, q, options);
            if (r.days !== null) return SM2Engine.formatInterval(0, r.days);
            return SM2Engine.formatInterval(r.delayMs / 1000);
        }

        /** { again, hard, good, easy } each { quality, label, days, seconds, state } for rendering the four buttons. */
        static previewIntervals(card, options = {}) {
            const out = {};
            SM2Engine.BUTTONS.forEach(button => {
                const r = SM2Engine.schedule(card, button.quality, options);
                out[button.key] = {
                    quality: button.quality,
                    label: r.days !== null ? SM2Engine.formatInterval(0, r.days) : SM2Engine.formatInterval(r.delayMs / 1000),
                    days: r.days,
                    seconds: r.days !== null ? null : Math.round(r.delayMs / 1000),
                    state: r.fields.state
                };
            });
            return out;
        }

        // --- Queue helpers --------------------------------------------------------------------------
        static isDue(card, now = Date.now()) {
            if (!card || card.suspended) return false;
            const c = SM2Engine.normalize(card);
            if (c.state === 'new') return true;
            const dueAt = Date.parse(c.nextReviewDate);
            if (!Number.isFinite(dueAt)) return true;
            if (c.state === 'review') return SM2Engine.dayNumber(dueAt) <= SM2Engine.dayNumber(now);
            return dueAt <= now;
        }

        /** Per-deck "studied today" counters used for Anki's daily new/review limits. Resets at the 4am rollover. */
        static getDailyCounts(deck, now = Date.now()) {
            const today = SM2Engine.dayNumber(now);
            const stored = deck && deck.ankiToday;
            if (!stored || stored.day !== today) return { day: today, newDone: 0, reviewsDone: 0 };
            return { day: today, newDone: Number(stored.newDone) || 0, reviewsDone: Number(stored.reviewsDone) || 0 };
        }

        static createSession(cards, options = {}) {
            return new AnkiStudySession(cards, options);
        }

        /** Ordered snapshot of today's queue: due learning, then reviews (limit), then new cards (limit), then learning due later today. */
        static buildQueue(cards, options = {}) {
            return new AnkiStudySession(cards, options).snapshot(options.now);
        }

        /** Rough recall probability (0-100) assuming SM-2's ~90% retention at the scheduled interval. */
        static calculateRetrievability(card, now = Date.now()) {
            const c = SM2Engine.normalize(card);
            if (c.state === 'new' || !c.lastReviewed) return 0.0;
            const last = Date.parse(c.lastReviewed);
            const due = Date.parse(c.nextReviewDate);
            if (!Number.isFinite(last)) return 0.0;
            const spanDays = c.state === 'review' ? c.interval : Math.max(1 / 1440, (Number.isFinite(due) ? due - last : MINUTE) / DAY_MS);
            const elapsedDays = Math.max(0, (now - last) / DAY_MS);
            return parseFloat((Math.pow(0.9, elapsedDays / spanDays) * 100).toFixed(1));
        }
    }

    /**
     * Anki-style study session. Queue order:
     *   1. learning/relearning cards whose step is due now
     *   2. shuffled due review cards (limited by reviewsPerDay)
     *   3. shuffled new cards (limited by newCardsPerDay)
     *   4. learning cards due within the learn-ahead window, or (learnAheadAll, default) the next learning card early
     * Answered learning cards are re-queued automatically when their next step falls today.
     */
    const PRIORITY_JITTER = .04;

    class AnkiStudySession {
        constructor(cards, options = {}) {
            this.cfg = { ...SM2Engine.resolveOptions(options), ...pickLimits(options) };
            this.options = options;
            this.deck = options.deck || null;
            this.learnAheadAll = options.learnAheadAll !== false;
            // includeAll: every card is studyable at any time (no daily limits); reviews not scheduled yet come after
            // ready reviews and new cards, weakest memory first, and are graded with Anki's early-review intervals.
            this.includeAll = Boolean(options.includeAll);
            const now = Number.isFinite(options.now) ? options.now : Date.now();
            const counts = this.deck ? SM2Engine.getDailyCounts(this.deck, now)
                : { day: SM2Engine.dayNumber(now, this.cfg), newDone: options.newDoneToday || 0, reviewsDone: options.reviewsDoneToday || 0 };
            this.today = counts.day;
            this.newDone = counts.newDone;
            this.reviewsDone = counts.reviewsDone;
            this.learning = [];
            this.reviews = [];
            this.newCards = [];
            this.ahead = [];
            const endOfToday = SM2Engine.dayStart(this.today + 1, this.cfg);

            (cards || []).forEach((card, position) => {
                if (!card || card.suspended) return;
                const c = SM2Engine.normalize(card, this.cfg);
                const parsed = Date.parse(c.nextReviewDate);
                const dueAt = Number.isFinite(parsed) ? parsed : now;
                if (c.state === 'new') this.newCards.push({ card, dueAt: now, position, jitter: Math.random() * PRIORITY_JITTER });
                else if (c.state === 'review') {
                    if (SM2Engine.dayNumber(dueAt, this.cfg) <= this.today) this.reviews.push({ card, dueAt, position, tiebreak: Math.random(), jitter: Math.random() * PRIORITY_JITTER });
                    else if (this.includeAll) this.ahead.push({ card, dueAt, position, weight: AnkiStudySession.aheadWeight(c, now), jitter: Math.random() * PRIORITY_JITTER });
                } else if (dueAt < endOfToday || this.includeAll) this.learning.push({ card, dueAt, position });
            });

            const shuffle = queue => {
                for (let i = queue.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [queue[i], queue[j]] = [queue[j], queue[i]];
                }
            };
            if (!this.includeAll) {
                shuffle(this.reviews);
                shuffle(this.newCards);
            }
            this.ahead.sort((a, b) => a.weight - b.weight);
            if (!this.includeAll) {
                this.reviews = this.reviews.slice(0, Math.max(0, this.cfg.reviewsPerDay - this.reviewsDone));
                this.newCards = this.newCards.slice(0, Math.max(0, this.cfg.newCardsPerDay - this.newDone));
            }
            this.sortLearning();
        }

        /** Fraction of the scheduled interval still remaining (0 = about to be due, 1 = just reviewed). Lower is studied first. */
        static aheadWeight(c, now) {
            const last = Date.parse(c.lastReviewed);
            const due = Date.parse(c.nextReviewDate);
            if (!Number.isFinite(last) || !Number.isFinite(due) || due <= last) return 0;
            return Math.max(0, Math.min(1, (due - now) / (due - last)));
        }

        sortLearning() {
            this.learning.sort((a, b) => a.dueAt - b.dueAt || a.position - b.position);
        }

        /** Numeric practice priority, independent of the three presentation labels. Higher is more useful next. */
        static priority(card, now = Date.now()) {
            const c = SM2Engine.normalize(card);
            const progress = FlashcardTools.cardProgress(card);
            const stats = card.practiceStats || {};
            const lastPractice = Date.parse(stats.lastAnswered);
            const elapsed = Number.isFinite(lastPractice) ? Math.max(0, now - lastPractice) / DAY_MS : 0;
            const recall = c.state !== 'new' && Number.isFinite(Date.parse(c.lastReviewed))
                ? SM2Engine.calculateRetrievability(c, now) / 100
                : progress.attempts ? progress.mastery * Math.pow(.9, elapsed) : .5;
            const missPressure = Math.min(1, Math.max(0, Number(stats.missStreak) || 0) / 3);
            const lapsePressure = Math.min(1, c.lapses / 8);
            return .55 * (1 - recall) + .3 * (1 - progress.mastery) + .1 * missPressure + .05 * lapsePressure;
        }

        // A small per-session nudge so equally-ranked cards (e.g. a fresh deck) don't always start from card #1.
        static entryScore(entry, now) {
            return AnkiStudySession.priority(entry.card, now) + (entry.jitter || 0);
        }

        /** The card to show now, or null when the session is finished (or only waiting on learning cards when learnAheadAll is false). */
        next(now = Date.now()) {
            const learn = this.learning[0];
            if (learn && learn.dueAt <= now) return learn.card;
            if (this.includeAll) {
                let best = null, bestScore = -Infinity;
                for (const entry of [...this.reviews, ...this.newCards, ...this.ahead]) {
                    const score = AnkiStudySession.entryScore(entry, now);
                    if (score > bestScore || (score === bestScore && entry.position < best.position)) {
                        best = entry;
                        bestScore = score;
                    }
                }
                if (best) return best.card;
            }
            if (this.reviews.length) return this.reviews[0].card;
            if (this.newCards.length) return this.newCards[0].card;
            if (this.ahead.length) return this.ahead[0].card;
            if (learn && (this.learnAheadAll || learn.dueAt <= now + this.cfg.learnAheadMinutes * MINUTE)) return learn.card;
            return null;
        }

        /** When nothing is shown because learning cards are still waiting, the time (ms) the next one is due. */
        nextLearningDueAt() {
            return this.learning.length ? this.learning[0].dueAt : null;
        }

        /** Answers a card (quality 0-5 or 'again'|'hard'|'good'|'easy'), updates it in place and re-queues it if needed. */
        answer(card, quality, now = Date.now()) {
            const result = SM2Engine.schedule(card, quality, { ...this.options, now, deck: undefined });
            this.remove(card);
            Object.assign(card, result.fields);
            delete card.stability;
            delete card.difficulty;
            if (result.previousState === 'new') this.newDone += 1;
            else if (result.previousState === 'review') this.reviewsDone += 1;
            if (this.deck) this.deck.ankiToday = { day: this.today, newDone: this.newDone, reviewsDone: this.reviewsDone };
            const requeued = (card.state === 'learning' || card.state === 'relearning')
                && (this.includeAll || result.dueAt < SM2Engine.dayStart(this.today + 1, this.cfg));
            if (requeued) {
                this.learning.push({ card, dueAt: result.dueAt, position: Number.MAX_SAFE_INTEGER });
                this.sortLearning();
            }
            return { card, fields: result.fields, requeued, leechTriggered: result.leechTriggered, dueAt: result.dueAt };
        }

        remove(card) {
            ['learning', 'reviews', 'newCards', 'ahead'].forEach(queue => {
                this[queue] = this[queue].filter(entry => entry.card !== card);
            });
        }

        /** Anki's three counters: new (blue), learning (red), review (green; includes early reviews in includeAll mode). */
        counts() {
            const practiced = this.newCards.filter(({ card }) => Number(card.practiceStats?.attempts) > 0).length;
            return { new: this.newCards.length - practiced, learning: this.learning.length + practiced,
                review: this.reviews.length + this.ahead.length };
        }

        get remaining() {
            return this.newCards.length + this.learning.length + this.reviews.length + this.ahead.length;
        }

        isFinished() {
            return this.remaining === 0;
        }

        snapshot(now = Date.now()) {
            const dueLearning = this.learning.filter(e => e.dueAt <= now);
            const laterLearning = this.learning.filter(e => e.dueAt > now);
            if (this.includeAll) {
                const practice = [...this.reviews, ...this.newCards, ...this.ahead].sort((a, b) =>
                    AnkiStudySession.entryScore(b, now) - AnkiStudySession.entryScore(a, now) || a.position - b.position);
                return [...dueLearning, ...practice, ...laterLearning].map(e => e.card);
            }
            return [...dueLearning, ...this.reviews, ...this.newCards, ...this.ahead, ...laterLearning].map(e => e.card);
        }
    }

    function pickLimits(options) {
        const out = {};
        ['newCardsPerDay', 'reviewsPerDay', 'learnAheadMinutes'].forEach(key => {
            if (Number.isFinite(options[key])) out[key] = options[key];
        });
        return out;
    }

    // ============================================================================
    // 3. BAYESIAN KNOWLEDGE TRACING (BKT) ENGINE
    // ============================================================================
    class BKTEngine {
        constructor() {
            // Standard optimal starting BKT Parameters
            this.pInit = 0.25;    // P(L0): Initial probability of knowing the skill
            this.pTransit = 0.15; // P(T): Prob of transitioning from unlearned to learned
            this.pSlip = 0.10;    // P(S): Prob of making a mistake despite knowing skill
            this.pGuess = 0.20;   // P(G): Prob of guessing correctly despite not knowing skill
        }

        /**
         * Updates mastery state probability P(L_t) given correct or incorrect answer.
         */
        updateMastery(pMasteryCurrent, isCorrect) {
            const pL = pMasteryCurrent !== undefined ? pMasteryCurrent : this.pInit;
            let pLGivenObs = 0;

            if (isCorrect) {
                // P(L | Correct)
                pLGivenObs = (pL * (1 - this.pSlip)) / ((pL * (1 - this.pSlip)) + ((1 - pL) * this.pGuess));
            } else {
                // P(L | Incorrect)
                pLGivenObs = (pL * this.pSlip) / ((pL * this.pSlip) + ((1 - pL) * (1 - this.pGuess)));
            }

            // Transit to next state: P(L_t) = P(L_{t-1} | Obs) + (1 - P(L_{t-1} | Obs)) * P(T)
            const pNext = pLGivenObs + (1 - pLGivenObs) * this.pTransit;
            return parseFloat(Math.min(0.999, Math.max(0.001, pNext)).toFixed(4));
        }
    }

    // ============================================================================
    // 4. MULTI-FORMAT EXPORTER & ENGINE CORE
    // ============================================================================
    class FlashcardEngine {
        constructor() {
            this.container = typeof document !== 'undefined' ? document.getElementById('view-flashcards') : null;
            this.appState = null;
            this.eventBus = null;
            this.bkt = new BKTEngine();
            
            this.activeDeckId = null;
            this.activeCardIndex = 0;
            this.isFlipped = false;
        }

        init(appState, eventBus) {
            this.appState = appState;
            this.eventBus = eventBus;

            if(this.eventBus) {
                this.eventBus.on('flashcards:updated', () => this.render());
                this.eventBus.on('router:navigated', (route) => {
                    if (route === 'flashcards') this.render();
                });
            }

            if (this.appState && this.appState.get('currentView') === 'flashcards') {
                this.render();
            }
        }

        // --- FORMAT 1: Printable Cheat Sheet Renderer ---
        exportCheatSheet(deck) {
            const hierarchy = ContextLinkedHierarchyBus.getHierarchyString(deck);
            const printWin = window.open('', '_blank');
            printWin.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${deck.title} - Cheat Sheet</title>
                    <style>
                        body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 20px; font-size: 10px; line-height: 1.4; color: #000; }
                        h1 { font-size: 18px; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 4px; }
                        .meta { font-size: 10px; color: #555; margin-bottom: 20px; font-family: monospace; }
                        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
                        .card { border: 1px solid #aaa; padding: 10px; page-break-inside: avoid; border-radius: 4px; }
                        .q { font-weight: bold; margin-bottom: 6px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; }
                        .a { color: #222; }
                        @media print { body { padding: 0; } }
                    </style>
                </head>
                <body>
                    <h1>${deck.title} - Active Recall Cheat Sheet</h1>
                    <div class="meta">Hierarchy Link: ${hierarchy} | Cards: ${deck.cards.length}</div>
                    <div class="grid">
                        ${deck.cards.map((c, i) => `
                            <div class="card">
                                <div class="q">${i + 1}.${c.front}</div>
                                <div class="a">${c.back}</div>
                            </div>
                        `).join('')}
                    </div>
                    <script>window.print();</script>
                </body>
                </html>
            `);
            printWin.document.close();
        }

        // --- FORMAT 2: Structured Markdown (Notion/Obsidian) ---
        exportMarkdown(deck) {
            const hierarchy = ContextLinkedHierarchyBus.getHierarchyString(deck);
            let md = `# ${deck.title}\n\n`;
            md += `> **Hierarchy Link:** ${hierarchy}\n`;
            md += `> **BKT Mastery Level:** ${Math.round((deck.bktMastery || 0.25) * 100)}%\n\n`;
            md += `---\n\n`;

            deck.cards.forEach((c, idx) => {
                md += `### ${idx + 1}. ${c.front}\n`;
                md += `**Answer:** ${c.back}\n\n`;
                const s = SM2Engine.normalize(c);
                md += `- *State:* ${s.state} | *Ease:* ${Math.round(s.easeFactor * 100)}% | *Interval:* ${s.interval} days | *Lapses:* ${s.lapses}${s.leech ? ' | **Leech**' : ''}\n\n`;
            });

            const blob = new Blob([md], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${deck.title.replace(/\s+/g, '_')}_ObsidianExport.md`;
            a.click();
            URL.revokeObjectURL(url);
        }

        // --- FORMAT 3: Interactive Mind Map Visualizer (HTML5 Canvas) ---
        renderMindMap(deck) {
            const modal = document.createElement('div');
            modal.className = "mindmap-modal fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex flex-col p-6";
            modal.innerHTML = `
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h2 class="text-xl font-bold text-white">${deck.title}</h2>
                        <p class="text-xs text-slate-400 font-mono">${ContextLinkedHierarchyBus.getHierarchyString(deck)}</p>
                    </div>
                    <button id="close-mindmap" class="px-5 py-2 bg-rose-600/20 text-rose-400 border border-rose-500/50 rounded-lg">Close Visualizer</button>
                </div>
                <div class="flex-grow relative bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden shadow-2xl">
                    <canvas id="mindmap-canvas" class="w-full h-full block"></canvas>
                </div>
            `;
            document.body.appendChild(modal);

            const canvas = modal.querySelector('#mindmap-canvas');
            const ctx = canvas.getContext('2d');
            
            // Handle display scaling
            const rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = rect.width * window.devicePixelRatio;
            canvas.height = rect.height * window.devicePixelRatio;
            ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
            
            const centerX = rect.width / 2;
            const centerY = 100;

            const drawMap = () => {
                ctx.clearRect(0, 0, rect.width, rect.height);

                // Hierarchy Nodes (Top)
                ctx.fillStyle = '#6366f1'; 
                ctx.fillRect(centerX - 120, centerY - 25, 240, 50);
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 14px system-ui';
                ctx.textAlign = 'center';
                ctx.fillText(deck.title.substring(0, 30), centerX, centerY + 5);

                const count = deck.cards.length;
                const startX = 100;
                const endX = rect.width - 100;
                const stepX = count > 1 ? (endX - startX) / (count - 1) : 0;

                deck.cards.forEach((card, i) => {
                    const nodeX = count === 1 ? centerX : startX + (i * stepX);
                    const nodeY = centerY + 200 + (i % 2 === 0 ? 0 : 60);

                    // Connecting lines
                    ctx.beginPath();
                    ctx.moveTo(centerX, centerY + 25);
                    ctx.bezierCurveTo(centerX, nodeY - 80, nodeX, centerY + 80, nodeX, nodeY - 20);
                    ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // Card Node
                    ctx.fillStyle = '#1e293b';
                    ctx.strokeStyle = '#3b82f6';
                    ctx.lineWidth = 1;
                    
                    ctx.beginPath();
                    ctx.roundRect(nodeX - 80, nodeY - 25, 160, 50, 6);
                    ctx.fill();
                    ctx.stroke();

                    // Card Text
                    ctx.fillStyle = '#f8fafc';
                    ctx.font = '11px system-ui';
                    ctx.fillText(card.front.substring(0, 22) + (card.front.length > 22 ? '...' : ''), nodeX, nodeY);
                    
                    // BKT Data Mini-Tag
                    ctx.fillStyle = '#94a3b8';
                    ctx.font = '9px monospace';
                    ctx.fillText(`Ease: ${Math.round(SM2Engine.normalize(card).easeFactor * 100)}%`, nodeX, nodeY + 16);
                });
            };

            drawMap();

            modal.querySelector('#close-mindmap').addEventListener('click', () => {
                modal.remove();
            });
        }

        // ============================================================================
        // DOM RENDERING & STUDY LOGIC
        // ============================================================================
        render() {
            if (!this.container) return;

            const decks = this.appState ? (this.appState.get('flashcardDecks') || []) : [];

            if (this.activeDeckId) {
                const activeDeck = decks.find(d => d.id === this.activeDeckId);
                if (activeDeck) return this.renderStudySession(activeDeck);
            }

            // Dashboard View
            this.container.innerHTML = `
                <div class="flashcard-dashboard max-w-7xl mx-auto space-y-8">
                    <div class="border-b border-slate-700/60 pb-5">
                        <h1 class="text-3xl font-bold text-white">Flashcard Studio</h1>
                        <p class="text-slate-400 mt-1 flex gap-2">
                            <span class="px-2 bg-indigo-500/10 text-indigo-400 rounded">ANKI SM-2 ENGINE</span>
                            <span class="px-2 bg-emerald-500/10 text-emerald-400 rounded">BKT TRACING</span>
                        </p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        ${decks.map(deck => {
                            const masteryPct = Math.round((deck.bktMastery || this.bkt.pInit) * 100);
                            return `
                                <div class="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
                                    <h3 class="text-lg font-bold text-white">${deck.title}</h3>
                                    <p class="text-[10px] text-slate-400 font-mono truncate">${ContextLinkedHierarchyBus.getHierarchyString(deck)}</p>
                                    
                                    <div class="my-4 p-3 bg-slate-900/50 rounded-lg">
                                        <div class="flex justify-between text-xs mb-2 text-slate-400">
                                            <span>Mastery P(L_t)</span>
                                            <span class="text-indigo-400 font-bold">${masteryPct}%</span>
                                        </div>
                                        <div class="w-full bg-slate-800 rounded-full h-1.5">
                                            <div class="h-1.5 rounded-full bg-indigo-500" style="width: ${masteryPct}%"></div>
                                        </div>
                                    </div>

                                    <div class="space-y-2">
                                        <button data-action="study" data-id="${deck.id}" class="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold">Begin Session</button>
                                        <div class="grid grid-cols-3 gap-2 text-xs">
                                            <button data-action="export-sheet" data-id="${deck.id}" class="py-1 bg-slate-700 text-slate-300 rounded">Cheat Sheet</button>
                                            <button data-action="export-md" data-id="${deck.id}" class="py-1 bg-slate-700 text-slate-300 rounded">Markdown</button>
                                            <button data-action="export-map" data-id="${deck.id}" class="py-1 bg-slate-700 text-slate-300 rounded">Mind Map</button>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;

            this.bindEvents(decks);
        }

        renderStudySession(deck) {
            const card = deck.cards[this.activeCardIndex];
            const total = deck.cards.length;
            const retrievability = card ? SM2Engine.calculateRetrievability(card) : 0;
            const previews = card && this.isFlipped ? SM2Engine.previewIntervals(card) : null;

            this.container.innerHTML = `
                <div class="study-session max-w-3xl mx-auto space-y-6 pt-4">
                    <div class="flex justify-between items-center bg-slate-800 p-4 rounded-xl">
                        <button id="btn-end-session" class="text-slate-300 text-sm font-semibold">End Session</button>
                        <span class="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded">R(t): ${retrievability}% | Card ${this.activeCardIndex + 1}/${total}</span>
                    </div>

                    <div id="flashcard-surface" class="w-full min-h-[400px] bg-slate-800 border-2 ${this.isFlipped ? 'border-emerald-500/30' : 'border-indigo-500/30'} rounded-2xl p-10 flex flex-col justify-center items-center text-center cursor-pointer shadow-lg relative">
                        <h2 class="text-3xl font-bold text-white">
                            ${this.isFlipped ? card.back : card.front}
                        </h2>
                        <div class="absolute bottom-6 text-xs text-slate-500">
                            ${this.isFlipped ? 'Rate your recall below' : 'Click to flip'}
                        </div>
                    </div>

                    ${this.isFlipped ? `
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                            ${SM2Engine.BUTTONS.map(button => `
                                <button data-q="${button.quality}" class="p-3 bg-slate-700 text-slate-100 rounded-lg text-xs font-bold border border-slate-600">
                                    <span class="block text-[10px] text-slate-400">${previews[button.key].label}</span>${button.label}
                                </button>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;

            const cardSurface = this.container.querySelector('#flashcard-surface');
            if (cardSurface && !this.isFlipped) {
                cardSurface.addEventListener('click', () => {
                    this.isFlipped = true;
                    this.renderStudySession(deck);
                });
            }

            const endBtn = this.container.querySelector('#btn-end-session');
            if (endBtn) {
                endBtn.addEventListener('click', () => {
                    this.activeDeckId = null;
                    this.render();
                });
            }

            this.container.querySelectorAll('[data-q]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const q = parseInt(e.currentTarget.getAttribute('data-q'));
                    this.processRating(deck, q);
                });
            });
        }

        processRating(deck, q) {
            const card = deck.cards[this.activeCardIndex];
            
            Object.assign(card, SM2Engine.evaluate(card, q));

            // BKT update
            const isCorrect = q >= 4;
            deck.bktMastery = this.bkt.updateMastery(deck.bktMastery, isCorrect);

            // Save state
            if (this.appState && this.appState.updateDeck) {
                this.appState.updateDeck(deck.id, deck);
            }

            // Next card
            this.isFlipped = false;
            if (this.activeCardIndex < deck.cards.length - 1) {
                this.activeCardIndex += 1;
                this.renderStudySession(deck);
            } else {
                window.StudBudDialogs.notify(`Session Complete! BKT Skill Mastery: ${Math.round(deck.bktMastery * 100)}%`);
                this.activeDeckId = null;
                this.activeCardIndex = 0;
                this.render();
            }
        }

        bindEvents(decks) {
            this.container.addEventListener('click', (e) => {
                const target = e.target.closest('[data-action]');
                if (!target) return;

                const action = target.getAttribute('data-action');
                const id = target.getAttribute('data-id');
                const deck = decks.find(d => d.id === id);

                if (!deck) return;

                switch(action) {
                    case 'study':
                        this.activeDeckId = id;
                        this.activeCardIndex = 0;
                        this.isFlipped = false;
                        this.render();
                        break;
                    case 'export-sheet':
                        this.exportCheatSheet(deck);
                        break;
                    case 'export-md':
                        this.exportMarkdown(deck);
                        break;
                    case 'export-map':
                        this.renderMindMap(deck);
                        break;
                }
            });
        }
    }

    const FlashcardTools = {
        parseBulkCards(text) {
            const lines = String(text || '').split(/\r?\n/).filter(line => line.trim());
            if (!lines.length || lines.length > 300) throw new Error('Paste between 1 and 300 cards.');
            return lines.map((line, index) => {
                const parts = line.split(line.includes('\t') ? '\t' : '::').map(part => part.trim());
                if (parts.length < 2 || parts.length > 3 || !parts[0] || !parts[1] || parts[0].length > 5000 || parts[1].length > 5000) {
                    throw new Error(`Row ${index + 1}: use Question, Answer and optional tags separated by tabs or ::. Each side must have 1-5000 characters.`);
                }
                const tags = [...new Set((parts[2] || '').split(',').map(tag => tag.trim()).filter(Boolean))];
                if (tags.length > 20 || tags.some(tag => tag.length > 60)) throw new Error(`Row ${index + 1}: use at most 20 tags of 60 characters each.`);
                return { front: parts[0], back: parts[1], tags };
            });
        },
        answerKey(text) {
            return String(text ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').replace(/[.!?;:,]+$/, '').toLowerCase();
        },
        gradeAnswer(given, expected, strict = true) {
            const a = this.answerKey(given), b = this.answerKey(expected);
            if (!a || !b) return false;
            if (a === b) return true;
            if (strict) return false;
            // Keep quantities, operators and negation intact even during punctuation cleanup.
            if (/[0-9+\-*/=<>^%\u2212\u00d7\u00f7\u00b1\u2264\u2265]/.test(a + b) || /\b(no|not|never|without)\b/.test(a + ' ' + b)) return false;
            const relaxed = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['"\u2018\u2019\u201c\u201d]/g, '')
                .replace(/[.!?;:,]/g, ' ').replace(/\s+/g, ' ').trim();
            const x = relaxed(a), y = relaxed(b);
            if (x === y) return true;
            if (x.length < 6 || y.length < 6 || Math.abs(x.length - y.length) > 1) return false;
            let i = 0, j = 0, edits = 0;
            while (i < x.length && j < y.length) {
                if (x[i] === y[j]) { i++; j++; continue; }
                if (++edits > 1) return false;
                if (x.length >= y.length) i++;
                if (y.length >= x.length) j++;
            }
            return edits + (x.length - i) + (y.length - j) <= 1;
        },
        keywordGroups(text) {
            const rows = String(text || '').split(/\r?\n/).map(row => row.trim()).filter(Boolean);
            if (rows.length > 20) throw new Error('Use at most 20 required keyword groups.');
            return rows.map(row => {
                const options = row.split('|').map(value => value.trim());
                if (options.length > 5 || options.some(value => !value || value.length > 80 || !/[\p{L}\p{N}]/u.test(value))) throw new Error('Each keyword line needs 1-5 words or phrases (up to 80 characters), separated by | for alternatives.');
                return [...new Set(options)];
            });
        },
        gradeCard(given, card, strict = true) {
            const mode = card.answerMode || (strict ? 'exact' : 'vocabulary');
            const answers = [card.back, ...(card.acceptedAnswers || [])];
            if (answers.some(answer => this.gradeAnswer(given, answer, mode !== 'vocabulary'))) return true;
            return mode === 'keywords' && this.matchesKeywords(given, card);
        },
        matchesKeywords(given, card) {
            if (!card.keywords?.length || !String(given || '').trim()) return false;
            const tokens = value => this.answerKey(value).match(/[\p{L}\p{N}]+/gu) || [];
            const words = tokens(given), canonical = tokens(card.back);
            const negated = list => list.some(word => ['not', 'never', 'no', 'without'].includes(word));
            if (negated(words) !== negated(canonical)) return false;
            const quantities = value => this.answerKey(value).match(/[+\-\u2212]?\d+(?:[.,]\d+)*/g) || [];
            const operators = value => this.answerKey(value).match(/[+*/=<>^%\u2212\u00d7\u00f7\u00b1\u2264\u2265]|(?:^|\s)-(?=\s|\d)/g) || [];
            if (JSON.stringify(quantities(given)) !== JSON.stringify(quantities(card.back))
                || JSON.stringify(operators(given)) !== JSON.stringify(operators(card.back))) return false;
            return card.keywords.every(group => Array.isArray(group) && group.length && group.some(phrase => {
                const required = tokens(phrase);
                return required.length && words.some((_, at) => required.every((word, offset) => words[at + offset] === word));
            }));
        },
        attachmentSource(attachment) {
            const types = ['application/pdf', 'text/plain', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm'];
            return attachment && types.includes(attachment.type) && typeof attachment.data === 'string'
                && attachment.data.length <= 1400000
                && attachment.data.startsWith(`data:${attachment.type};base64,`)
                && /^[A-Za-z0-9+/=\r\n]+$/.test(attachment.data.split(',')[1] || '')
                && typeof attachment.name === 'string' && attachment.name.length > 0 && attachment.name.length <= 160
                ? attachment.data : '';
        },
        distractors(card, pool, count = 3, { vary = false } = {}) {
            const used = new Set([this.answerKey(card.back)]);
            const picks = [];
            // Games pass vary so the same card does not always show the exact same four choices.
            const custom = vary ? [...(card.distractors || [])].sort(() => Math.random() - 0.5) : (card.distractors || []);
            const customLimit = vary && (pool || []).length > count + 2 && Math.random() < 0.35 ? count - 1 : count;
            for (const text of custom) {
                const key = this.answerKey(text);
                if (key && !used.has(key)) { used.add(key); picks.push({ back: String(text) }); }
                if (picks.length >= customLimit) break;
            }
            if (picks.length >= count) return picks;
            const words = text => new Set(this.answerKey(text).match(/[\p{L}\p{N}]+/gu) || []);
            const target = words(card.back), prompt = words(card.front);
            const number = text => /^[+-]?\d+(?:\.\d+)?$/.test(this.answerKey(text));
            const candidates = (pool || []).filter(item => item && item !== card).map((item, index) => {
                const terms = words(item.back), front = words(item.front);
                const shared = [...terms].filter(word => target.has(word)).length;
                const sameTag = (card.tags || []).some(tag => (item.tags || []).includes(tag));
                const similarity = shared / Math.max(1, new Set([...target, ...terms]).size);
                return { item, rank: similarity * 4 + (sameTag ? 2 : 0)
                    + [...front].filter(word => prompt.has(word)).length / Math.max(1, prompt.size)
                    + (number(card.back) === number(item.back) ? 1 : 0)
                    + 1 / (1 + Math.abs(String(card.back).length - String(item.back).length))
                    + (vary ? Math.random() * 1.5 : 0), tie: vary ? Math.random() : index };
            }).sort((a, b) => b.rank - a.rank || a.tie - b.tie);
            for (const { item } of candidates) {
                const key = this.answerKey(item.back);
                if (!key || used.has(key)) continue;
                used.add(key); picks.push(item);
                if (picks.length >= count) break;
            }
            return picks;
        },
        weight(card) {
            const stats = card.practiceStats || {};
            const attempts = Math.max(0, Number(stats.attempts) || 0);
            const accuracy = stats.recentAnswers?.length === 4 ? this.cardProgress(card).accuracy
                : (Math.max(0, Number(stats.correct) || 0) + 1) / (attempts + 2);
            return 1 + (1 - accuracy) * 4 + Math.min(3, Math.max(0, Number(stats.missStreak) || 0))
                + Math.min(2, Math.max(0, Number(card.lapses) || 0) * .25);
        },
        adaptiveOrder(cards) {
            return cards.map(card => ({ card, rank: -Math.log(Math.max(Number.EPSILON, Math.random())) / this.weight(card) }))
                .sort((a, b) => a.rank - b.rank).map(item => item.card);
        },
        cardProgress(card) {
            const stats = card.practiceStats || {};
            const recent = Array.isArray(stats.recentAnswers) ? stats.recentAnswers.filter(value => typeof value === 'boolean').slice(-4) : [];
            const attempts = Math.max(0, Number(stats.attempts) || 0);
            const correct = Math.min(attempts, Math.max(0, Number(stats.correct) || 0));
            const useRecent = recent.length === 4;
            const accuracy = useRecent ? recent.filter(Boolean).length / recent.length : attempts ? correct / attempts : 0;
            const mastery = attempts
                ? Array.isArray(stats.recentEvidence) && stats.recentEvidence.length
                    ? stats.recentEvidence.slice(-4).reduce((sum, entry) => sum + (entry?.correct === true ? entry.weight === 1 ? 1 : .5 : 0), 0) / 4
                    : Math.min(1, (useRecent ? recent.length : attempts) / 4) * accuracy * .5
                : Number(card.interval) >= 21 || Number(card.repetitions) >= 4 ? 1 : Number(card.repetitions) >= 1 ? .5 : 0;
            return { mastery, accuracy, attempts, weak: (useRecent || attempts > 1) && accuracy < .75 };
        },
        recordAnswer(card, correct, kind = 'recognition') {
            const stats = card.practiceStats || {};
            const weight = kind === 'recall' ? 1 : .5;
            const previous = Array.isArray(stats.recentEvidence) ? stats.recentEvidence
                : (Array.isArray(stats.recentAnswers) ? stats.recentAnswers.filter(value => typeof value === 'boolean')
                    : Array.from({ length: Math.min(3, Number(stats.attempts) || 0) }, (_, i) => i < (Number(stats.correct) || 0)))
                    .map(value => ({ correct: value, weight: .5 }));
            card.practiceStats = {
                attempts: (Number(stats.attempts) || 0) + 1,
                correct: (Number(stats.correct) || 0) + (correct ? 1 : 0),
                missStreak: correct ? 0 : (Number(stats.missStreak) || 0) + 1,
                lastCorrect: Boolean(correct), lastAnswered: new Date().toISOString(),
                recentAnswers: [...(Array.isArray(stats.recentAnswers) ? stats.recentAnswers.filter(value => typeof value === 'boolean') : []), Boolean(correct)].slice(-4),
                recentEvidence: [...previous, { correct: Boolean(correct), weight }].slice(-4)
            };
        },
        imageSource(value) {
            return typeof value === 'string' && value.length <= 700000
                && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(value) ? value : '';
        }
    };

    // Export module
    global.FlashcardTools = FlashcardTools;
    global.FlashcardEngine = new FlashcardEngine();
    global.ContextLinkedHierarchyBus = ContextLinkedHierarchyBus;
    global.SM2Engine = SM2Engine;
    global.AnkiScheduler = SM2Engine;
    global.AnkiStudySession = AnkiStudySession;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { SM2Engine, AnkiStudySession, BKTEngine, ContextLinkedHierarchyBus, FlashcardTools };
    }

    // Boot hook
    if (global.NexusApp && global.NexusApp.AppState) {
        global.FlashcardEngine.init(global.NexusApp.AppState, global.NexusApp.EventBus);
    }
})(typeof window !== 'undefined' ? window : globalThis);