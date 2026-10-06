/**
 * NEXUS STUDENT HUB
 * FILE: analyticsEngine.js (8 of 9)
 * DESCRIPTION: Analytical & Predictive Features including Time-on-Task & Velocity Tracking,
 * Projected Exam Score Forecasting, Ebbinghaus Forgetting Curve Visualizer, and Course Mastery Dashboard.
 */

(function (global) {
    'use strict';

    // ============================================================================
    // 1. TIME-ON-TASK & VELOCITY TRACKER
    // ============================================================================
    class VelocityTracker {
        constructor() {
            this.sessionStart = null;
            this.activeTimeMs = 0;
            this.flips = 0;
            this.correctFlips = 0;
            this.isTracking = false;
        }

        startSession() {
            this.sessionStart = Date.now();
            this.flips = 0;
            this.correctFlips = 0;
            this.isTracking = true;
        }

        logFlip(isCorrect) {
            if (!this.isTracking) return;
            this.flips++;
            if (isCorrect) this.correctFlips++;
        }

        endSession() {
            if (!this.isTracking) return null;
            const sessionEnd = Date.now();
            const durationMs = sessionEnd - this.sessionStart;
            this.activeTimeMs += durationMs;
            this.isTracking = false;

            const durationMinutes = durationMs / 60000;
            const velocity = durationMinutes > 0 ? (this.flips / durationMinutes) : 0;
            const accuracy = this.flips > 0 ? (this.correctFlips / this.flips) : 0;

            return {
                durationMinutes: parseFloat(durationMinutes.toFixed(2)),
                flips: this.flips,
                velocity: parseFloat(velocity.toFixed(2)),
                accuracy: parseFloat(accuracy.toFixed(2))
            };
        }
    }

    // ============================================================================
    // 2. PROJECTED EXAM SCORE FORECASTER
    // ============================================================================
    class ExamForecaster {
        /**
         * Calculates Projected Exam Score (G_exam)
         * Formula implemented: G_exam = (0.35 * P(L) + 0.25 * avg(R) + 0.20 * S_velocity + 0.20 * H_practice) * 100
         */
        static calculate(deck, analyticsData) {
            // 1. P(L): Bayesian Knowledge Tracing Mastery (0.0 to 1.0)
            const pL = deck.bktMastery || 0.25;

            // 2. avg(R): Average Retrievability (0.0 to 1.0)
            const avgR = this.calculateAverageRetrievability(deck) / 100;

            // 3. S_velocity: Normalized velocity score (Optimal ~12-20 flips/min)
            const rawVelocity = analyticsData.velocity || 10;
            let sVelocity = rawVelocity / 15.0; 
            if (sVelocity > 1.0) sVelocity = 1.0; // Cap at 1.0

            // 4. H_practice: Normalized study hours score (target ~5 hours per unit for full score)
            const rawHours = (analyticsData.totalMinutes || 0) / 60;
            let hPractice = rawHours / 5.0;
            if (hPractice > 1.0) hPractice = 1.0; // Cap at 1.0

            // Apply Weights
            const weightedSum = (0.35 * pL) + (0.25 * avgR) + (0.20 * sVelocity) + (0.20 * hPractice);
            
            return Math.min(100, Math.max(0, Math.round(weightedSum * 100)));
        }

        static calculateAverageRetrievability(deck) {
            if (!deck.cards || deck.cards.length === 0) return 0;
            let totalR = 0;
            deck.cards.forEach(card => {
                // Calculate Ebbinghaus decay: R = e^(-t/S)
                if (!card.lastReviewed || !card.interval) {
                    totalR += 0; // Unseen cards have 0 retrievability
                } else {
                    const elapsedDays = (Date.now() - new Date(card.lastReviewed).getTime()) / (1000 * 60 * 60 * 24);
                    const stability = Math.max(1, card.interval);
                    totalR += Math.exp(-elapsedDays / stability);
                }
            });
            return (totalR / deck.cards.length) * 100;
        }
    }

    // ============================================================================
    // 3. EBBINGHAUS FORGETTING CURVE VISUALIZER
    // ============================================================================
    class EbbinghausVisualizer {
        static render(canvasId, stabilityScores = [1, 3, 7]) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            
            const rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = rect.width * window.devicePixelRatio;
            canvas.height = rect.height * window.devicePixelRatio;
            ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

            const width = rect.width;
            const height = rect.height;
            const padding = 40;
            const graphWidth = width - (padding * 2);
            const graphHeight = height - (padding * 2);

            ctx.clearRect(0, 0, width, height);

            // Draw Axes
            ctx.beginPath();
            ctx.strokeStyle = '#475569'; // slate-600
            ctx.lineWidth = 2;
            ctx.moveTo(padding, padding);
            ctx.lineTo(padding, height - padding);
            ctx.lineTo(width - padding, height - padding);
            ctx.stroke();

            // Labels
            ctx.fillStyle = '#94a3b8'; // slate-400
            ctx.font = '12px system-ui';
            ctx.textAlign = 'right';
            ctx.fillText('100%', padding - 10, padding + 5);
            ctx.fillText('0%', padding - 10, height - padding);
            
            ctx.textAlign = 'center';
            ctx.fillText('Days Elapsed', width / 2, height - 10);
            ctx.fillText('0', padding, height - padding + 20);
            ctx.fillText('30', width - padding, height - padding + 20);

            // Colors for different stability (S) curves
            const colors = ['#ef4444', '#f59e0b', '#10b981']; // Red (S=1), Amber (S=3), Green (S=7)

            // Plot curves R(t) = e^(-t/S)
            stabilityScores.forEach((S, index) => {
                ctx.beginPath();
                ctx.strokeStyle = colors[index % colors.length];
                ctx.lineWidth = 3;
                
                for (let t = 0; t <= 30; t++) {
                    const r = Math.exp(-t / S); // Retrievability
                    const x = padding + (t / 30) * graphWidth;
                    const y = (height - padding) - (r * graphHeight);
                    
                    if (t === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            });

            // Legend
            stabilityScores.forEach((S, index) => {
                ctx.fillStyle = colors[index % colors.length];
                ctx.fillRect(width - 100, padding + (index * 25), 12, 12);
                ctx.fillStyle = '#e2e8f0';
                ctx.textAlign = 'left';
                ctx.font = '11px system-ui';
                ctx.fillText(`Interval: ${S}d`, width - 80, padding + 10 + (index * 25));
            });
        }
    }

    // ============================================================================
    // 4. COURSE MASTERY ANALYTICS DASHBOARD
    // ============================================================================
    class AnalyticsEngine {
        constructor() {
            this.container = document.getElementById('view-analytics');
            this.appState = null;
            this.eventBus = null;
            this.tracker = new VelocityTracker();
            
            // Mock global analytics data store for demonstration
            this.globalAnalytics = {
                totalMinutes: 145,
                velocity: 14.5, // flips per min
                sessionsCompleted: 12
            };
        }

        init(appState, eventBus) {
            this.appState = appState;
            this.eventBus = eventBus;

            if (this.eventBus) {
                this.eventBus.on('router:navigated', (route) => {
                    if (route === 'analytics') this.render();
                });
                
                // Track study sessions from Flashcard Engine
                this.eventBus.on('study:start', () => this.tracker.startSession());
                this.eventBus.on('study:flip', (data) => this.tracker.logFlip(data.isCorrect));
                this.eventBus.on('study:end', () => {
                    const stats = this.tracker.endSession();
                    if (stats) {
                        this.globalAnalytics.totalMinutes += stats.durationMinutes;
                        // Rolling average velocity
                        this.globalAnalytics.velocity = (this.globalAnalytics.velocity + stats.velocity) / 2;
                        this.globalAnalytics.sessionsCompleted += 1;
                    }
                });
            }
            
            if (this.appState && this.appState.get('currentView') === 'analytics') {
                this.render();
            }
        }

        render() {
            if (!this.container) return;

            const decks = this.appState ? (this.appState.get('flashcardDecks') || []) : [];

            // Aggregate global mastery
            let totalBKT = 0;
            decks.forEach(d => { totalBKT += (d.bktMastery || 0.25); });
            const avgBKT = decks.length > 0 ? (totalBKT / decks.length) * 100 : 0;

            this.container.innerHTML = `
                <div class="max-w-7xl mx-auto space-y-8 pb-12 animate-fade-in">
                    <!-- Dashboard Header -->
                    <div class="border-b border-slate-700/60 pb-5 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
                        <div>
                            <h1 class="text-3xl font-bold text-white tracking-tight">Intelligence & Analytics</h1>
                            <p class="text-slate-400 mt-1">Velocity tracking, score forecasting, and memory retention mapping.</p>
                        </div>
                        <div class="flex gap-4">
                            <div class="text-right">
                                <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Total Study Time</p>
                                <p class="text-xl font-mono text-emerald-400">${Math.round(this.globalAnalytics.totalMinutes / 60)}h ${Math.round(this.globalAnalytics.totalMinutes % 60)}m</p>
                            </div>
                            <div class="text-right">
                                <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Avg Velocity</p>
                                <p class="text-xl font-mono text-indigo-400">${this.globalAnalytics.velocity.toFixed(1)} f/m</p>
                            </div>
                        </div>
                    </div>

                    <!-- Top Analytics Grid -->
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        <!-- Exam Score Forecaster -->
                        <div class="lg:col-span-1 bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/30 rounded-xl p-6 shadow-xl relative overflow-hidden">
                            <div class="absolute -right-6 -top-6 w-32 h-32 bg-indigo-500/20 blur-3xl rounded-full"></div>
                            <h3 class="text-lg font-bold text-white mb-6 flex items-center gap-2">
                                <svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                                Exam Score Forecaster
                            </h3>
                            
                            <div class="space-y-4">
                                ${decks.slice(0, 3).map(deck => {
                                    const score = ExamForecaster.calculate(deck, this.globalAnalytics);
                                    let color = score >= 90 ? 'text-emerald-400' : (score >= 80 ? 'text-blue-400' : 'text-amber-400');
                                    return `
                                        <div class="flex justify-between items-center p-3 bg-slate-900/80 rounded-lg border border-slate-700/50">
                                            <div class="truncate pr-4">
                                                <p class="text-sm font-semibold text-slate-200 truncate">${deck.title}</p>
                                                <p class="text-[10px] text-slate-500 font-mono">${deck.hierarchyPath ? deck.hierarchyPath.split(' > ').pop() : 'General'}</p>
                                            </div>
                                            <div class="text-2xl font-bold font-mono ${color}">
                                                ${score}%
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                                ${decks.length === 0 ? '<p class="text-slate-500 text-sm">No active decks to forecast.</p>' : ''}
                            </div>
                            <div class="mt-4 text-[10px] text-indigo-300/60 font-mono text-center">
                                Model: 0.35P(L) + 0.25R + 0.20v + 0.20h
                            </div>
                        </div>

                        <!-- Ebbinghaus Forgetting Curve Visualizer -->
                        <div class="lg:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg flex flex-col">
                            <div class="flex justify-between items-start mb-2">
                                <div>
                                    <h3 class="text-lg font-bold text-white">Ebbinghaus Memory Decay</h3>
                                    <p class="text-xs text-slate-400">Retrievability probability R(t) = e^(-t/S) over 30 days.</p>
                                </div>
                                <span class="px-2 py-1 bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded font-mono">Real-time Canvas Render</span>
                            </div>
                            <div class="flex-grow w-full min-h-[250px] relative mt-4">
                                <canvas id="ebbinghaus-canvas" class="absolute inset-0 w-full h-full"></canvas>
                            </div>
                        </div>
                    </div>

                    <!-- Course Mastery Heatmap & Diagnostics -->
                    <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-6 shadow-lg">
                        <h3 class="text-lg font-bold text-white mb-6">Subject Diagnostics & Weaknesses</h3>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <!-- Progress Meters -->
                            <div class="space-y-6">
                                ${decks.map(deck => {
                                    const m = Math.round((deck.bktMastery || 0.25) * 100);
                                    const r = Math.round(ExamForecaster.calculateAverageRetrievability(deck));
                                    return `
                                        <div>
                                            <div class="flex justify-between text-sm mb-1">
                                                <span class="text-white font-medium truncate pr-4">${deck.title}</span>
                                                <span class="text-slate-400 font-mono text-xs">M: ${m}\% \vert{} R:${r}%</span>
                                            </div>
                                            <div class="w-full bg-slate-900 rounded-full h-2 flex overflow-hidden border border-slate-700/50">
                                                <div class="bg-indigo-500 h-2" style="width: ${m}%" title="Mastery P(L)"></div>
                                                <div class="bg-emerald-500/50 h-2" style="width: ${r > m ? r - m : 0}%" title="Retrievability Backup"></div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>

                            <!-- Weakness Diagnostics Engine -->
                            <div class="bg-slate-900/50 rounded-lg p-5 border border-rose-900/30">
                                <h4 class="text-sm font-bold text-rose-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                    Priority Weaknesses
                                </h4>
                                <ul class="space-y-3">
                                    ${decks.filter(d => (d.bktMastery || 0.25) < 0.6).map(deck => `
                                        <li class="flex items-start gap-3 text-sm">
                                            <div class="mt-1 w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"></div>
                                            <div>
                                                <p class="text-slate-200 font-medium">${deck.title}</p>
                                                <p class="text-xs text-slate-500 mt-0.5">BKT Mastery is critically low (${Math.round(deck.bktMastery * 100)}%). Recommend intensive SM-2 review session today.</p>
                                            </div>
                                        </li>
                                    `).join('')}
                                    ${decks.filter(d => (d.bktMastery || 0.25) < 0.6).length === 0 ? '<li class="text-slate-400 text-sm">No critical weaknesses detected. You are on track.</li>' : ''}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Render Canvas Post-DOM Injection
            setTimeout(() => {
                EbbinghausVisualizer.render('ebbinghaus-canvas', [1, 3, 7]);
            }, 50);
        }
    }

    // Export modules to global scope
    global.VelocityTracker = VelocityTracker;
    global.ExamForecaster = ExamForecaster;
    global.EbbinghausVisualizer = EbbinghausVisualizer;
    global.AnalyticsEngine = new AnalyticsEngine();

    // Initialization hook for the Nexus Student Hub environment
    if (global.NexusApp && global.NexusApp.AppState) {
        global.AnalyticsEngine.init(global.NexusApp.AppState, global.NexusApp.EventBus);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (global.NexusApp && global.NexusApp.EventBus) {
                global.NexusApp.EventBus.on('app:ready', () => {
                    global.AnalyticsEngine.init(global.NexusApp.AppState, global.NexusApp.EventBus);
                });
            }
        });
    }

})(window);