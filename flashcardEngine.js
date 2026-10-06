/**
 * NEXUS STUDENT HUB
 * FILE: flashcardEngine.js (7 of 9)
 * DESCRIPTION: Advanced Spaced Repetition (SuperMemo SM-2), Bayesian Knowledge Tracing (BKT),
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
    // 2. SUPERMEMO SM-2 ALGORITHM ENGINE
    // ============================================================================
    class SM2Engine {
        /**
         * Calculates new SM-2 parameters after a review response.
         * Quality (q): 0 (Blackout) to 5 (Perfect recall)
         */
        static evaluate(card, q) {
            if (!Number.isInteger(q) || q < 0 || q > 5) {
                throw new RangeError('Review quality must be an integer from 0 through 5.');
            }
            let repetitions = card.repetitions || 0;
            let easeFactor = card.easeFactor || 2.5;
            let interval = card.interval || 0;
            let lapses = card.lapses || 0;

            if (q >= 3) {
                // Successful Recall
                if (repetitions === 0) {
                    interval = 1;
                } else if (repetitions === 1) {
                    interval = 6;
                } else {
                    interval = Math.round(interval * easeFactor);
                }
                interval = Math.max(1, Math.min(interval, 36500));
                repetitions += 1;
            } else {
                // Failed Recall (Lapse)
                repetitions = 0;
                interval = 1;
                lapses += 1;
            }

            // Calculate new Ease Factor (EF), bounded strictly above 1.3
            easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
            if (easeFactor < 1.3) easeFactor = 1.3;

            const reviewedAt = Date.now();
            const lastReviewed = new Date(reviewedAt).toISOString();
            const nextReviewDate = new Date(reviewedAt + interval * 86400000).toISOString();

            return {
                repetitions,
                easeFactor: parseFloat(easeFactor.toFixed(3)),
                interval,
                lapses,
                lastReviewed,
                nextReviewDate
            };
        }

        /**
         * Ebbinghaus Retrievability Decay: R(t) = e^(-t/S)
         */
        static calculateRetrievability(card) {
            if (!card.lastReviewed || !card.interval) return 0.0;
            const elapsedDays = (Date.now() - new Date(card.lastReviewed).getTime()) / (1000 * 60 * 60 * 24);
            const stability = Math.max(1, card.interval); // S factor
            const retrievability = Math.exp(-elapsedDays / stability);
            return parseFloat((retrievability * 100).toFixed(1));
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
                md += `- *Ease Factor:* ${c.easeFactor || 2.5} | *Interval:* ${c.interval || 0} days | *Lapses:* ${c.lapses || 0}\n\n`;
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
                    ctx.fillText(`EF: ${card.easeFactor || 2.5}`, nodeX, nodeY + 16);
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
                            <span class="px-2 bg-indigo-500/10 text-indigo-400 rounded">SM-2 ENGINE</span>
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
            
            // SM-2 evaluation
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