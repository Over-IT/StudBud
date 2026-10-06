/**
 * NEXUS STUDENT HUB - PCHS EDITION
 * FILE: plannerEngine.js
 * DESCRIPTION: Multi-variable priority calculus planner engine, Eisenhower Matrix sorting 
 * visualizer, PCHS 7-Period Red/Blue Block Schedule manager, and Burnout Risk Index analyzer.
 */

(function (window) {
    'use strict';

    class PlannerEngine {
        constructor() {
            this.container = document.getElementById('view-assignments');
            this.appState = null;
            this.eventBus = null;
        }

        init(appState, eventBus) {
            this.appState = appState;
            this.eventBus = eventBus;

            // Event Listeners for reactive updates
            this.eventBus.on('assignments:updated', () => this.render());
            this.eventBus.on('courses:updated', () => this.render());
            this.eventBus.on('router:navigated', (route) => {
                if (route === 'assignments') this.render();
            });

            if (this.appState.get('currentView') === 'assignments') {
                this.render();
            }
        }

        // ============================================================================
        // 1. MULTI-VARIABLE PRIORITY CALCULUS ENGINE
        // ============================================================================

        /**
         * Calculates task urgency score P using the formula:
         * P = (10 / (d + 0.5)) * w * (1 + 1 / (1 + e^(10 * (deltaG - 0.02)))) * (2 - P(L)) * B
         *
         * @param {Object} assignment 
         * @param {Object|null} course 
         * @param {number} bktMastery - Bayesian Knowledge Tracing score (0.0 to 1.0)
         * @param {number} burnoutFactor - Burnout multiplier B (e.g. 1.0 to 1.3)
         * @returns {Object} Priority metrics
         */
        calculatePriorityScore(assignment, course = null, bktMastery = 0.5, burnoutFactor = 1.0) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const dueDate = new Date(assignment.dueDate || today);
            dueDate.setHours(0, 0, 0, 0);

            // 1. Due date proximity 'd' in days
            const diffMs = dueDate.getTime() - today.getTime();
            const d = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

            // 2. Weight 'w'
            const weightMap = { 'low': 0.8, 'medium': 1.0, 'high': 1.5, 'critical': 2.0 };
            const w = weightMap[assignment.priority] || 1.0;

            // 3. Grade boundary proximity 'deltaG'
            let deltaG = 0.05; // Default 5% gap if no course data
            if (course && typeof course.currentPct === 'number') {
                const pctDecimal = course.currentPct / 100;
                // Standard PCHS grade boundaries
                const boundaries = [0.98, 0.93, 0.90, 0.87, 0.83, 0.80, 0.77, 0.73, 0.70, 0.67, 0.63, 0.60];
                let minDiff = 1.0;
                boundaries.forEach(b => {
                    const diff = Math.abs(b - pctDecimal);
                    if (diff < minDiff) minDiff = diff;
                });
                deltaG = minDiff;
            }

            // 4. Sigmoid grade boost term: doubles priority if within 2% (0.02) of a boundary
            const sigmoid = 1 / (1 + Math.exp(10 * (deltaG - 0.02)));
            const gradeTerm = 1 + sigmoid;

            // 5. BKT Mastery term (2 - P(L))
            const clampedMastery = Math.min(1.0, Math.max(0.0, bktMastery));
            const masteryTerm = 2 - clampedMastery;

            // 6. Urgency base
            const urgency = 10 / (d + 0.5);

            // 7. Final Calculus Total P
            const P = urgency * w * gradeTerm * masteryTerm * burnoutFactor;

            return {
                score: parseFloat(P.toFixed(2)),
                daysRemaining: d,
                urgency: parseFloat(urgency.toFixed(2)),
                gradeTerm: parseFloat(gradeTerm.toFixed(2)),
                masteryTerm: parseFloat(masteryTerm.toFixed(2))
            };
        }

        /**
         * Evaluates Eisenhower Matrix Quadrant based on priority calculus P and days remaining d
         */
        getEisenhowerQuadrant(priorityCalc, estimatedMinutes) {
            const P = priorityCalc.score;
            const d = priorityCalc.daysRemaining;

            if (P >= 20 || d <= 1) {
                return { id: "doFirst", title: "Do First", bg: "bg-red-950/20", border: "border-red-500/50" };
            } else if (P >= 12 && d > 1) {
                return { id: "schedule", title: "Schedule", bg: "bg-indigo-950/20", border: "border-indigo-500/50" };
            } else if (P < 12 && estimatedMinutes <= 15) {
                return { id: "quickFinish", title: "Quick Finish", bg: "bg-amber-950/20", border: "border-amber-500/50" };
            } else {
                return { id: "lowPriority", title: "Low Priority", bg: "bg-slate-900/40", border: "border-slate-700" };
            }
        }

        // ============================================================================
        // 2. PCHS 7-PERIOD BLOCK SCHEDULE MANAGER
        // ============================================================================

        /**
         * Resolves Parkway Central High School Red/Blue Alternating Block Schedule
         */
        getPCHSBlockSchedule(date = new Date()) {
            const dayOfWeek = date.getDay(); // 0 = Sun, 6 = Sat
            
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                return { type: "Weekend", title: "Weekend", classes: [] };
            }

            const startOfYear = new Date(date.getFullYear(), 0, 1);
            const dayOfYear = Math.floor((date - startOfYear) / (1000 * 60 * 60 * 24));

            // Monday: Anchor All-Period Day (50-min periods)
            if (dayOfWeek === 1) {
                return {
                    type: "Anchor",
                    title: "Anchor Day (Periods 1-7)",
                    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
                    classes: [
                        { period: "1st Period", time: "7:35 AM - 8:25 AM" },
                        { period: "2nd Period", time: "8:30 AM - 9:20 AM" },
                        { period: "3rd Period", time: "9:25 AM - 10:15 AM" },
                        { period: "4th Period", time: "10:20 AM - 11:10 AM" },
                        { period: "5th Period & Lunch", time: "11:15 AM - 12:40 PM" },
                        { period: "6th Period", time: "12:45 PM - 1:35 PM" },
                        { period: "7th Period", time: "1:40 PM - 2:30 PM" }
                    ]
                };
            }

            // Alternating Block Days (Red = Odd, Blue = Even)
            if (dayOfYear % 2 === 0) {
                return {
                    type: "Red",
                    title: "Red Day (Block)",
                    badge: "bg-red-500/20 text-red-300 border-red-500/30",
                    classes: [
                        { period: "1st Period", time: "7:35 AM - 9:05 AM" },
                        { period: "3rd Period", time: "9:12 AM - 10:42 AM" },
                        { period: "5th Period & Lunch", time: "10:49 AM - 12:53 PM" },
                        { period: "ColT / Advisory", time: "12:58 PM - 1:35 PM" },
                        { period: "7th Period", time: "1:40 PM - 2:30 PM" }
                    ]
                };
            } else {
                return {
                    type: "Blue",
                    title: "Blue Day (Block)",
                    badge: "bg-blue-500/20 text-blue-300 border-blue-500/30",
                    classes: [
                        { period: "2nd Period", time: "7:35 AM - 9:05 AM" },
                        { period: "4th Period", time: "9:12 AM - 10:42 AM" },
                        { period: "5th Period & Lunch", time: "10:49 AM - 12:53 PM" },
                        { period: "Academic Lab", time: "12:58 PM - 1:35 PM" },
                        { period: "6th Period", time: "1:40 PM - 2:30 PM" }
                    ]
                };
            }
        }

        // ============================================================================
        // 3. BURNOUT RISK INDEX ANALYZER
        // ============================================================================

        /**
         * Calculates cognitive workload stress and warns if daily study > 3.5 hrs
         */
        calculateBurnoutIndex(assignments) {
            let totalMinutes = 0;
            const pending = assignments.filter(a => a.status !== 'completed');

            pending.forEach(asgn => {
                totalMinutes += asgn.estimatedMinutes || (asgn.priority === 'high' ? 60 : 30);
            });

            const totalHours = totalMinutes / 60;
            const threshold = 3.5;
            const isBurnoutRisk = totalHours > threshold;
            const percentage = Math.min(100, Math.round((totalHours / 5.0) * 100));

            return {
                totalMinutes,
                totalHours: parseFloat(totalHours.toFixed(1)),
                threshold,
                isBurnoutRisk,
                percentage,
                burnoutFactor: isBurnoutRisk ? 1.25 : 1.0,
                message: isBurnoutRisk 
                    ? "Burnout Warning: Daily workload exceeds 3.5 hrs. Redistribute tasks or use 25-min Pomodoro intervals."
                    : "Optimal Workload: Schedule is within healthy cognitive bounds."
            };
        }

        // ============================================================================
        // 4. UI RENDERING ENGINE & INTERACTIVE LISTENERS
        // ============================================================================

        render() {
            if (!this.container) return;

            const rawAssignments = this.appState.get('assignments') || [];
            const courses = this.appState.get('courses') || [];
            const schedule = this.getPCHSBlockSchedule(new Date());
            const burnout = this.calculateBurnoutIndex(rawAssignments);

            const courseMap = new Map();
            courses.forEach(c => courseMap.set(c.code, c));

            // Process priorities
            const processedAssignments = rawAssignments.map(asgn => {
                const course = courseMap.get(asgn.courseCode) || null;
                const calc = this.calculatePriorityScore(asgn, course, 0.5, burnout.burnoutFactor);
                const quad = this.getEisenhowerQuadrant(calc, asgn.estimatedMinutes || 30);
                return { ...asgn, course, calc, quad };
            });

            // Sort by P-score descending
            processedAssignments.sort((a, b) => b.calc.score - a.calc.score);

            const quadrants = {
                doFirst: processedAssignments.filter(a => a.quad.id === 'doFirst' && a.status !== 'completed'),
                schedule: processedAssignments.filter(a => a.quad.id === 'schedule' && a.status !== 'completed'),
                quickFinish: processedAssignments.filter(a => a.quad.id === 'quickFinish' && a.status !== 'completed'),
                lowPriority: processedAssignments.filter(a => a.quad.id === 'lowPriority' && a.status !== 'completed')
            };

            this.container.innerHTML = `
                <div class="max-w-7xl mx-auto space-y-8 animate-fade-in pb-12">
                    
                    <!-- Header -->
                    <div class="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-700 pb-5 gap-4">
                        <div>
                            <h1 class="text-3xl font-bold text-white tracking-tight">Assignment Calculus Engine</h1>
                            <p class="text-slate-400 mt-1">Algorithmic prioritization based on grade boundaries, due dates, and burnout risk.</p>
                        </div>
                        <button id="btn-add-task" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-all">
                            + Add Assignment
                        </button>
                    </div>

                    <!-- Top Grid: Schedule & Burnout -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        
                        <!-- PCHS Schedule Widget -->
                        <div class="bg-slate-800 border border-slate-700 rounded-xl p-6 relative overflow-hidden">
                            <div class="flex justify-between items-start mb-4">
                                <div>
                                    <h3 class="text-xl font-bold text-white">${schedule.title}</h3>
                                    <p class="text-xs text-slate-400 uppercase tracking-wider mt-1">Today's Schedule</p>
                                </div>
                                <span class="px-3 py-1 text-xs font-bold rounded-full border ${schedule.badge || 'bg-slate-700 text-slate-300'}">
                                    ${schedule.type}
                                </span>
                            </div>
                            <div class="space-y-2 mt-4">
                                ${schedule.classes.map(c => `
                                    <div class="flex justify-between items-center text-sm py-2 border-b border-slate-700/50 last:border-0">
                                        <span class="text-slate-300 font-medium">${c.period}</span>
                                        <span class="text-slate-400 font-mono text-xs">${c.time}</span>
                                    </div>
                                `).join('')}
                                ${schedule.classes.length === 0 ? '<p class="text-slate-500 text-sm">No classes scheduled for today.</p>' : ''}
                            </div>
                        </div>

                        <!-- Burnout Risk Visualizer -->
                        <div class="bg-slate-800 border border-slate-700 rounded-xl p-6 flex flex-col justify-between">
                            <div>
                                <div class="flex justify-between items-center mb-4">
                                    <h3 class="text-xl font-bold text-white">Burnout Risk Index</h3>
                                    <span class="text-lg font-black ${burnout.isBurnoutRisk ? 'text-red-400' : 'text-emerald-400'}">
                                        ${burnout.totalHours}h / ${burnout.threshold}h
                                    </span>
                                </div>
                                <div class="w-full bg-slate-900 rounded-full h-4 mb-4 overflow-hidden border border-slate-700">
                                    <div class="h-full transition-all duration-700 ${burnout.isBurnoutRisk ? 'bg-red-500' : 'bg-emerald-500'}" style="width: ${burnout.percentage}%"></div>
                                </div>
                                <p class="text-sm p-3 rounded-lg ${burnout.isBurnoutRisk ? 'bg-red-950/40 text-red-300 border border-red-900/50' : 'bg-slate-900/50 text-slate-300'}">
                                    ${burnout.message}
                                </p>
                            </div>
                            <div class="mt-6 pt-4 border-t border-slate-700 text-xs text-slate-400 grid grid-cols-2 gap-4">
                                <div>Burnout Multiplier (B): <strong class="text-white">${burnout.burnoutFactor}x</strong></div>
                                <div class="text-right">Active Tasks: <strong class="text-white">${processedAssignments.filter(a => a.status !== 'completed').length}</strong></div>
                            </div>
                        </div>
                    </div>

                    <!-- Eisenhower Matrix -->
                    <div class="pt-6">
                        <h2 class="text-2xl font-bold text-white mb-6">Eisenhower Decision Matrix</h2>
                        
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            ${this.renderQuadrant("Do First", "Urgent & Important", quadrants.doFirst, "border-red-500/40 bg-red-950/10")}
                            ${this.renderQuadrant("Schedule", "Important, Less Urgent", quadrants.schedule, "border-indigo-500/40 bg-indigo-950/10")}
                            ${this.renderQuadrant("Quick Finish", "Low Priority, Fast", quadrants.quickFinish, "border-amber-500/40 bg-amber-950/10")}
                            ${this.renderQuadrant("Low Priority", "Routine Tasks", quadrants.lowPriority, "border-slate-700 bg-slate-900/30")}
                        </div>
                    </div>

                    <!-- Raw Data Table -->
                    <div class="bg-slate-800 border border-slate-700 rounded-xl p-6 mt-8">
                        <h2 class="text-xl font-bold text-white mb-4">Complete Assignment Log</h2>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-sm text-slate-300">
                                <thead class="bg-slate-900 text-xs uppercase text-slate-400 border-b border-slate-700">
                                    <tr>
                                        <th class="p-4">Done</th>
                                        <th class="p-4">Assignment</th>
                                        <th class="p-4">Course</th>
                                        <th class="p-4">Due</th>
                                        <th class="p-4">P-Score</th>
                                        <th class="p-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-700/50">
                                    ${processedAssignments.length > 0 ? processedAssignments.map(asgn => `
                                        <tr class="hover:bg-slate-700/30 transition-colors ${asgn.status === 'completed' ? 'opacity-40' : ''}">
                                            <td class="p-4">
                                                <input type="checkbox" data-action="toggle" data-id="${asgn.id}" ${asgn.status === 'completed' ? 'checked' : ''} class="w-5 h-5 rounded bg-slate-900 border-slate-600 cursor-pointer accent-indigo-500">
                                            </td>
                                            <td class="p-4 font-semibold text-white ${asgn.status === 'completed' ? 'line-through' : ''}">${asgn.title}</td>
                                            <td class="p-4"><span class="px-2 py-1 bg-slate-700 rounded text-xs">${asgn.courseCode}</span></td>
                                            <td class="p-4 text-slate-400">${asgn.dueDate}</td>
                                            <td class="p-4 font-mono font-bold ${asgn.calc.score >= 20 ? 'text-red-400' : 'text-emerald-400'}">${asgn.calc.score}</td>
                                            <td class="p-4 text-right">
                                                <button data-action="delete" data-id="${asgn.id}" class="text-xs text-slate-400 hover:text-red-400 px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded transition-colors">Delete</button>
                                            </td>
                                        </tr>
                                    `).join('') : `<tr><td colspan="6" class="p-6 text-center text-slate-500">No assignments found.</td></tr>`}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;

            this.bindEvents();
        }

        renderQuadrant(title, subtitle, list, style) {
            return `
                <div class="border ${style} rounded-xl p-5 flex flex-col h-full min-h-[250px]">
                    <div class="flex justify-between items-center mb-4 border-b border-slate-700/50 pb-3">
                        <div>
                            <h3 class="font-bold text-white text-lg">${title}</h3>
                            <p class="text-xs text-slate-400">${subtitle}</p>
                        </div>
                        <span class="px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 shadow-inner">
                            ${list.length}
                        </span>
                    </div>
                    <div class="space-y-3 flex-grow overflow-y-auto custom-scrollbar">
                        ${list.length > 0 ? list.map(item => `
                            <div class="bg-slate-800 border border-slate-700/80 rounded-lg p-4 shadow hover:border-slate-500 transition-colors flex justify-between items-center group cursor-pointer" data-action="toggle" data-id="${item.id}">
                                <div>
                                    <div class="font-semibold text-white text-sm group-hover:text-indigo-300 transition-colors">${item.title}</div>
                                    <div class="flex items-center gap-2 mt-1.5">
                                        <span class="text-[10px] uppercase font-bold text-indigo-400 bg-indigo-400/10 px-1.5 py-0.5 rounded">${item.courseCode}</span>
                                        <span class="text-xs text-slate-400">${item.calc.daysRemaining === 0 ? 'Due Today' : `In ${item.calc.daysRemaining} days`}</span>
                                    </div>
                                </div>
                                <div class="text-right">
                                    <div class="text-xs font-mono font-bold px-2 py-1 bg-slate-900 rounded text-amber-300 border border-slate-700 mb-1">
                                        P: ${item.calc.score}
                                    </div>
                                    <div class="text-[10px] text-slate-500">${item.estimatedMinutes || 30}m</div>
                                </div>
                            </div>
                        `).join('') : `<div class="h-full flex items-center justify-center text-sm text-slate-500 italic py-8">Quadrant empty.</div>`}
                    </div>
                </div>
            `;
        }

        bindEvents() {
            const addBtn = this.container.querySelector('#btn-add-task');
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    const title = prompt("Assignment Title:");
                    if (!title) return;
                    
                    const code = prompt("Course Code (e.g. MAT402):", "MAT402") || "GEN101";
                    const days = parseInt(prompt("Days until due:", "2")) || 2;
                    const mins = parseInt(prompt("Estimated minutes to complete:", "45")) || 45;
                    
                    const dueDate = new Date();
                    dueDate.setDate(dueDate.getDate() + days);

                    this.appState.addAssignment({
                        id: 'asgn_' + Date.now(),
                        title,
                        courseCode: code.toUpperCase(),
                        dueDate: dueDate.toISOString().split('T')[0],
                        priority: 'medium',
                        estimatedMinutes: mins,
                        status: 'pending'
                    });
                });
            }

            this.container.addEventListener('click', (e) => {
                const toggleTarget = e.target.closest('[data-action="toggle"]');
                const deleteTarget = e.target.closest('[data-action="delete"]');

                if (toggleTarget && !deleteTarget) {
                    const id = toggleTarget.getAttribute('data-id');
                    const asgn = this.appState.get('assignments').find(a => a.id === id);
                    if (asgn) {
                        this.appState.updateAssignment(id, { 
                            status: asgn.status === 'completed' ? 'pending' : 'completed' 
                        });
                    }
                }

                if (deleteTarget) {
                    e.stopPropagation();
                    const id = deleteTarget.getAttribute('data-id');
                    if (confirm("Delete this assignment?")) {
                        this.appState.deleteAssignment(id);
                    }
                }
            });
        }
    }

    // Export to global namespace
    window.PlannerEngine = new PlannerEngine();

    // Auto-init logic
    if (window.NexusApp && window.NexusApp.AppState) {
        window.PlannerEngine.init(window.NexusApp.AppState, window.NexusApp.EventBus);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.NexusApp && window.NexusApp.EventBus) {
                window.NexusApp.EventBus.on('app:ready', () => {
                    window.PlannerEngine.init(window.NexusApp.AppState, window.NexusApp.EventBus);
                });
            }
        });
    }

})(window);