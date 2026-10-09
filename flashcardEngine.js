/**
 * NEXUS STUDENT HUB
 * FILE: flashcardEngine.js (7 of 9)
 * DESCRIPTION: Advanced Spaced Repetition (FSRS-6, as used by Anki), Bayesian Knowledge Tracing (BKT),
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
    // 2. FSRS-6 SCHEDULER (the algorithm used by current Anki, with its default parameters)
    // ============================================================================
    class SM2Engine {
        static W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
        static RETENTION = 0.9;
        static MAX_INTERVAL = 36500;
        static LEARNING_STEPS = [1, 10]; // minutes
        static RELEARNING_STEPS = [10];
        static DAY = 86400000;

        static get decay() { return -SM2Engine.W[20]; }
        static get factor() { return Math.pow(0.9, 1 / SM2Engine.decay) - 1; }

        static forgetting(days, stability) {
            return Math.pow(1 + SM2Engine.factor * days / stability, SM2Engine.decay);
        }

        static initialDifficulty(grade, clamp = true) {
            const d = SM2Engine.W[4] - Math.exp(SM2Engine.W[5] * (grade - 1)) + 1;
            return clamp ? Math.min(10, Math.max(1, d)) : d;
        }

        static nextDifficulty(d, grade) {
            const W = SM2Engine.W;
            const delta = -W[6] * (grade - 3);
            const damped = d + (10 - d) * delta / 9;
            const next = W[7] * SM2Engine.initialDifficulty(4, false) + (1 - W[7]) * damped;
            return Math.min(10, Math.max(1, next));
        }

        static shortTermStability(s, grade) {
            const W = SM2Engine.W;
            let inc = Math.exp(W[17] * (grade - 3 + W[18])) * Math.pow(s, -W[19]);
            if (grade >= 2) inc = Math.max(inc, 1);
            return Math.max(0.001, s * inc);
        }

        static nextStability(d, s, r, grade) {
            const W = SM2Engine.W;
            let next;
            if (grade === 1) {
                const longTerm = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]);
                const shortTerm = s / Math.exp(W[17] * W[18]);
                next = Math.min(longTerm, shortTerm);
            } else {
                const hard = grade === 2 ? W[15] : 1, easy = grade === 4 ? W[16] : 1;
                next = s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hard * easy);
            }
            return Math.max(0.001, next);
        }

        static nextIntervalDays(s) {
            const raw = s / SM2Engine.factor * (Math.pow(SM2Engine.RETENTION, 1 / SM2Engine.decay) - 1);
            return Math.min(SM2Engine.MAX_INTERVAL, Math.max(1, Math.round(raw)));
        }

        static fuzz(days) {
            if (days < 2.5) return days;
            let delta = 1;
            for (const [start, end, f] of [[2.5, 7, 0.15], [7, 20, 0.1], [20, Infinity, 0.05]]) {
                delta += f * Math.max(Math.min(days, end) - start, 0);
            }
            let lo = Math.max(2, Math.round(days - delta));
            const hi = Math.min(Math.round(days + delta), SM2Engine.MAX_INTERVAL);
            lo = Math.min(lo, hi);
            return Math.floor(Math.random() * (hi - lo + 1) + lo);
        }

        // Cards saved by the older scheduler have no stability yet, so derive it from their interval and ease
        static normalize(card) {
            if (card.stability && (card.difficulty || card.state === 'learning' || card.state === 'relearning')) return card;
            if (card.state === 'new') return card;
            if (card.stability) return { ...card, state: card.state || 'review', difficulty: card.difficulty || 5 };
            if (card.lastReviewed && card.interval > 0) {
                const ease = card.easeFactor || 2.5;
                return { ...card, state: 'review', stability: Math.max(0.1, card.interval), difficulty: Math.min(10, Math.max(1, 11 - (ease - 1.3) * 9 / 2.2)) };
            }
            return { ...card, state: 'new', stability: null, difficulty: null, step: 0 };
        }

        /**
         * Grades: q <= 2 = Again, 3 = Hard, 4 = Good, 5 = Easy. Returns the card's new scheduling fields.
         * Pass { fuzz: false } to preview a result without random interval fuzz.
         */
        static evaluate(card, q, options = {}) {
            if (!Number.isInteger(q) || q < 0 || q > 5) {
                throw new RangeError('Review quality must be an integer from 0 through 5.');
            }
            const grade = q <= 2 ? 1 : q - 1;
            const S = SM2Engine;
            const c = S.normalize(card);
            const now = Date.now();
            const days = c.lastReviewed ? Math.max(0, Math.floor((now - new Date(c.lastReviewed).getTime()) / S.DAY)) : null;
            const sameDay = days !== null && days < 1;
            const recall = () => c.stability > 0 ? S.forgetting(days || 0, c.stability) : 1;
            let { state, step = 0, stability, difficulty } = { state: c.state === 'new' ? 'learning' : c.state, step: c.step || 0, stability: c.stability, difficulty: c.difficulty };
            let lapses = card.lapses || 0, repetitions = card.repetitions || 0;
            let dueMs = null, dueDays = null;

            const graduate = () => { state = 'review'; step = 0; dueDays = S.nextIntervalDays(stability); };
            const stepResult = steps => {
                if (!steps.length || (step >= steps.length && grade >= 2)) return graduate();
                if (grade === 1) { step = 0; dueMs = steps[0] * 60000; }
                else if (grade === 2) {
                    if (step === 0) dueMs = (steps.length === 1 ? steps[0] * 1.5 : (steps[0] + steps[1]) / 2) * 60000;
                    else dueMs = steps[step] * 60000;
                } else if (grade === 3) {
                    if (step + 1 >= steps.length) graduate();
                    else { step += 1; dueMs = steps[step] * 60000; }
                } else graduate();
            };

            if (state === 'review') {
                stability = sameDay ? S.shortTermStability(stability, grade) : S.nextStability(difficulty, stability, recall(), grade);
                difficulty = S.nextDifficulty(difficulty, grade);
                if (grade === 1) {
                    lapses += 1;
                    state = 'relearning'; step = 0;
                    if (S.RELEARNING_STEPS.length) dueMs = S.RELEARNING_STEPS[0] * 60000;
                    else dueDays = S.nextIntervalDays(stability);
                } else dueDays = S.nextIntervalDays(stability);
            } else {
                if (!stability || !difficulty) {
                    stability = Math.max(0.001, S.W[grade - 1]);
                    difficulty = S.initialDifficulty(grade);
                } else if (sameDay) {
                    stability = S.shortTermStability(stability, grade);
                    difficulty = S.nextDifficulty(difficulty, grade);
                } else {
                    stability = S.nextStability(difficulty, stability, recall(), grade);
                    difficulty = S.nextDifficulty(difficulty, grade);
                }
                stepResult(state === 'relearning' ? S.RELEARNING_STEPS : S.LEARNING_STEPS);
            }

            let interval = 0;
            if (dueDays !== null) {
                interval = options.fuzz === false || state !== 'review' ? dueDays : S.fuzz(dueDays);
                dueMs = interval * S.DAY;
            }
            repetitions = grade === 1 ? 0 : repetitions + 1;

            return {
                state,
                step,
                stability: parseFloat(stability.toFixed(4)),
                difficulty: parseFloat(difficulty.toFixed(4)),
                repetitions,
                easeFactor: card.easeFactor || 2.5,
                interval,
                lapses,
                lastReviewed: new Date(now).toISOString(),
                nextReviewDate: new Date(now + dueMs).toISOString()
            };
        }

        /** Probability (0-100) that you can still recall the card right now: R = (1 + F·t/S)^-decay */
        static calculateRetrievability(card) {
            const c = SM2Engine.normalize(card);
            if (!c.lastReviewed || !c.stability) return 0.0;
            const elapsedDays = Math.max(0, (Date.now() - new Date(c.lastReviewed).getTime()) / SM2Engine.DAY);
            return parseFloat((SM2Engine.forgetting(elapsedDays, c.stability) * 100).toFixed(1));
        }
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
            this.container = document.getElementById('view-flashcards');
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
                md += `- *Stability:* ${c.stability ? c.stability.toFixed(1) : 0} days | *Difficulty:* ${c.difficulty ? c.difficulty.toFixed(1) : '-'} | *Interval:* ${c.interval || 0} days | *Lapses:* ${c.lapses || 0}\n\n`;
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
                    ctx.fillText(`D: ${card.difficulty ? card.difficulty.toFixed(1) : '–'}`, nodeX, nodeY + 16);
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
                            <span class="px-2 bg-indigo-500/10 text-indigo-400 rounded">FSRS-6 ENGINE</span>
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
                        <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
                            <button data-q="0" class="p-3 bg-red-900/50 text-red-300 rounded-lg text-xs font-bold border border-red-800">0 - Blackout</button>
                            <button data-q="1" class="p-3 bg-orange-900/50 text-orange-300 rounded-lg text-xs font-bold border border-orange-800">1 - Wrong</button>
                            <button data-q="2" class="p-3 bg-amber-900/50 text-amber-300 rounded-lg text-xs font-bold border border-amber-800">2 - Hard</button>
                            <button data-q="3" class="p-3 bg-blue-900/50 text-blue-300 rounded-lg text-xs font-bold border border-blue-800">3 - Good</button>
                            <button data-q="4" class="p-3 bg-emerald-900/30 text-emerald-300 rounded-lg text-xs font-bold border border-emerald-700">4 - Easy</button>
                            <button data-q="5" class="p-3 bg-emerald-600 text-white rounded-lg text-xs font-bold border border-emerald-500">5 - Perfect</button>
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
            
            // FSRS evaluation
            const sm2Result = SM2Engine.evaluate(card, q);
            Object.assign(card, sm2Result);

            // BKT update
            const isCorrect = q >= 3;
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
                alert(`Session Complete! BKT Skill Mastery: ${Math.round(deck.bktMastery * 100)}%`);
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

    // Export module
    global.FlashcardEngine = new FlashcardEngine();
    global.ContextLinkedHierarchyBus = ContextLinkedHierarchyBus;
    global.SM2Engine = SM2Engine;

    // Boot hook
    if (global.NexusApp && global.NexusApp.AppState) {
        global.FlashcardEngine.init(global.NexusApp.AppState, global.NexusApp.EventBus);
    }
})(window);