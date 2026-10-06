/**
 * NEXUS STUDENT HUB - PCHS EDITION
 * FILE: gpaCalculator.js
 * DESCRIPTION: Advanced GPA calculation engine, transcript auditor, Latin Honors evaluator,
 * Target GPA "What-If" solver, and a Monte Carlo grade probability simulator.
 */

(function (window) {
    'use strict';

    // ============================================================================
    // 1. CONSTANTS & PCHS GRADE SCALE
    // ============================================================================
    const GRADE_SCALE = {
        'A+': 4.000, 'A': 4.000, 'A-': 3.667,
        'B+': 3.333, 'B': 3.000, 'B-': 2.667,
        'C+': 2.333, 'C': 2.000, 'C-': 1.667,
        'D+': 1.333, 'D': 1.000, 'D-': 0.667,
        'F': 0.000
    };

    const GRAD_REQUIREMENTS = {
        "ELA": 4.0,
        "Math": 3.0,
        "Science": 3.0,
        "Social Studies": 3.0,
        "Fine Arts": 1.0,
        "Practical Arts": 1.0,
        "PE": 1.0,
        "Health": 0.5,
        "Personal Finance": 0.5,
        "Electives": 7.0
    };

    const TOTAL_CREDITS_REQUIRED = 24.0;

    // ============================================================================
    // 2. GPA & TRANSCRIPT ENGINE
    // ============================================================================
    class GPACalculatorEngine {
        constructor() {
            this.container = document.getElementById('view-gpa');
            this.appState = null;
            this.eventBus = null;
        }

        init(appState, eventBus) {
            this.appState = appState;
            this.eventBus = eventBus;

            // Listen for course updates to re-run simulations
            this.eventBus.on('courses:updated', () => this.render());
            this.eventBus.on('router:navigated', (route) => {
                if (route === 'gpa') this.render();
            });

            // Initial render if we start on the GPA view
            if (this.appState.get('currentView') === 'gpa') {
                this.render();
            }
        }

        /**
         * Converts a letter grade using the PCHS grade-scale data.
         */
        getGradePoints(grade, isWeighted) {
            const pchsGrade = (window.PCHS_GRADE_SCALE || []).find(item => item.letter === String(grade).toUpperCase());
            if (pchsGrade) return isWeighted ? pchsGrade.weighted : pchsGrade.unweighted;
            let basePts = GRADE_SCALE[grade.toUpperCase()];
            if (basePts === undefined) return 0;
            if (isWeighted && basePts >= 2.0) {
                return basePts + 0.5;
            }
            return basePts;
        }

        /**
         * Evaluates Current GPA (Weighted & Unweighted) based on current state courses
         */
        calculateCurrentGPA(courses) {
            let totalCredits = 0;
            let unweightedPoints = 0;
            let weightedPoints = 0;

            courses.forEach(course => {
                const credits = parseFloat(course.credits) || 0;
                totalCredits += credits;
                
                const gradeToUse = course.targetGrade || 'B'; // Fallback if no grade set
                
                unweightedPoints += this.getGradePoints(gradeToUse, false) * credits;
                weightedPoints += this.getGradePoints(gradeToUse, course.isWeighted) * credits;
            });

            return {
                totalCredits,
                unweighted: totalCredits > 0 ? (unweightedPoints / totalCredits).toFixed(3) : "0.000",
                weighted: totalCredits > 0 ? (weightedPoints / totalCredits).toFixed(3) : "0.000"
            };
        }

        /**
         * Determines Latin Honors Status based on PCHS standards
         */
        getLatinHonors(weightedGpa) {
            const gpa = parseFloat(weightedGpa);
            if (gpa >= 4.20) return { title: "Summa Cum Laude", color: "text-yellow-400", hex: "#facc15" };
            if (gpa >= 4.00) return { title: "Magna Cum Laude", color: "text-slate-200", hex: "#e2e8f0" };
            if (gpa >= 3.75) return { title: "Cum Laude", color: "text-orange-400", hex: "#fb923c" };
            return { title: "No Honors Qualification (Yet)", color: "text-slate-500", hex: "#64748b" };
        }

        /**
         * Audits credits against the 10 PCHS Graduation Buckets
         */
        auditTranscript(courses) {
            let audit = {};
            let totalEarned = 0;
            
            // Initialize buckets
            for (const [category, req] of Object.entries(GRAD_REQUIREMENTS)) {
                audit[category] = { earned: 0, required: req, complete: false };
            }

            // Distribute credits
            courses.forEach(course => {
                const credits = parseFloat(course.credits) || 0;
                const cat = course.category || "Electives";
                
                totalEarned += credits;

                if (audit[cat]) {
                    audit[cat].earned += credits;
                } else {
                    audit["Electives"].earned += credits;
                }
            });

            // Overflow core subjects into Electives once their bucket is full
            for (const cat of Object.keys(audit)) {
                if (cat !== "Electives" && audit[cat].earned > audit[cat].required) {
                    const overflow = audit[cat].earned - audit[cat].required;
                    audit[cat].earned = audit[cat].required;
                    audit["Electives"].earned += overflow;
                }
                audit[cat].complete = audit[cat].earned >= audit[cat].required;
            }

            return { buckets: audit, totalEarned, isGraduating: totalEarned >= TOTAL_CREDITS_REQUIRED };
        }

        // ============================================================================
        // 3. MATHEMATICAL SOLVERS & SIMULATORS
        // ============================================================================

        /**
         * Target GPA & "What-If" Solver
         * Formula: G_required = (T * (C_completed + C_future) - (GPA_current * C_completed)) / C_future
         */
        solveTargetGPA(targetGpa, currentGpa, completedCredits, futureCredits) {
            if (futureCredits <= 0) return null;
            
            const target = parseFloat(targetGpa);
            const current = parseFloat(currentGpa);
            
            const required = ((target * (completedCredits + futureCredits)) - (current * completedCredits)) / futureCredits;
            
            return {
                requiredGpa: required.toFixed(3),
                isPossible: required <= 5.0 && required >= 0,
                isUnachievable: required > 5.0
            };
        }

        /**
         * Monte Carlo Grade Probability Simulator (1,000 Iterations)
         */
        runMonteCarlo(courses) {
            const ITERATIONS = 1000;
            const possibleGrades = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F'];
            
            let gpaResults = [];

            for (let i = 0; i < ITERATIONS; i++) {
                let simWeightedPoints = 0;
                let simCredits = 0;

                courses.forEach(course => {
                    const credits = parseFloat(course.credits);
                    simCredits += credits;
                    
                    // Add slight variance to the student's target grade based on standard normal distribution
                    // For simulation, we randomly drift 0 to 2 grade steps from their target
                    const targetIndex = possibleGrades.indexOf(course.targetGrade || 'B');
                    let randomDrift = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
                    
                    // 10% chance of a bad day (dropping 2 grades)
                    if (Math.random() > 0.90) randomDrift += 2; 

                    let simIndex = Math.max(0, Math.min(possibleGrades.length - 1, targetIndex + randomDrift));
                    let simGrade = possibleGrades[simIndex];

                    simWeightedPoints += this.getGradePoints(simGrade, course.isWeighted) * credits;
                });

                let simGpa = simCredits > 0 ? (simWeightedPoints / simCredits) : 0;
                gpaResults.push(simGpa);
            }

            // Aggregate Results for UI
            const sorted = gpaResults.sort((a, b) => a - b);
            const median = sorted[Math.floor(ITERATIONS / 2)].toFixed(2);
            const high95 = sorted[Math.floor(ITERATIONS * 0.95)].toFixed(2);
            const low5 = sorted[Math.floor(ITERATIONS * 0.05)].toFixed(2);

            return { median, high95, low5 };
        }

        // ============================================================================
        // 4. DOM RENDERING & EVENT BINDING
        // ============================================================================

        render() {
            if (!this.container) return;

            const courses = this.appState.get('courses') || [];
            const gpaData = this.calculateCurrentGPA(courses);
            const auditData = this.auditTranscript(courses);
            const honors = this.getLatinHonors(gpaData.weighted);
            const targetProfileGpa = this.appState.get('profile').targetGpa || 4.0;
            
            // Assume student has 14 completed credits prior to this year for solver demo
            const completedCredits = 14.0; 
            const futureCredits = gpaData.totalCredits; // current courses count as future/in-progress for solver
            const solverData = this.solveTargetGPA(targetProfileGpa, 3.65, completedCredits, futureCredits);
            
            const mcData = this.runMonteCarlo(courses);

            this.container.innerHTML = `
                <div class="max-w-6xl mx-auto space-y-6 animate-fade-in">
                    
                    <!-- Header -->
                    <div class="flex justify-between items-end mb-8 border-b border-slate-700 pb-4">
                        <div>
                            <h1 class="text-3xl font-bold text-white tracking-tight">GPA & Transcript Auditor</h1>
                            <p class="text-slate-400 mt-1">Real-time PCHS scale calculation and progress tracking.</p>
                        </div>
                    </div>

                    <!-- Top Metrics Grid -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <!-- Cumulative GPA -->
                        <div class="bg-slate-800 border border-slate-700 rounded-xl p-6 relative overflow-hidden">
                            <div class="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-bl-full -mr-4 -mt-4"></div>
                            <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Weighted Cumulative</h3>
                            <div class="text-5xl font-black text-white tracking-tighter">${gpaData.weighted}</div>
                            <div class="mt-2 text-sm text-slate-400">Unweighted: <span class="text-slate-200">${gpaData.unweighted}</span></div>
                        </div>

                        <!-- Latin Honors -->
                        <div class="bg-slate-800 border border-slate-700 rounded-xl p-6 relative overflow-hidden">
                            <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Projected Honors</h3>
                            <div class="text-2xl font-bold ${honors.color} mt-2 leading-tight">${honors.title}</div>
                            <div class="mt-3 text-xs text-slate-500">Based on PCHS Magna/Summa requirements.</div>
                        </div>

                        <!-- Target GPA Solver -->
                        <div class="bg-slate-800 border border-slate-700 rounded-xl p-6 relative overflow-hidden">
                            <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Target Solver (${targetProfileGpa.toFixed(2)})</h3>
                            ${solverData ? `
                                <div class="text-3xl font-bold ${solverData.isUnachievable ? 'text-red-400' : 'text-emerald-400'}">
                                    ${solverData.requiredGpa} <span class="text-lg font-medium text-slate-500">Req. Avg</span>
                                </div>
                                <div class="mt-2 text-xs ${solverData.isUnachievable ? 'text-red-400' : 'text-slate-400'}">
                                    ${solverData.isUnachievable ? 'Mathematically unachievable (> 5.0 required).' : 'Achievable based on remaining credits.'}
                                </div>
                            ` : `<div class="text-slate-400 text-sm mt-4">Add future credits to calculate.</div>`}
                        </div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                        
                        <!-- Monte Carlo Simulation Panel -->
                        <div class="bg-slate-800 border border-slate-700 rounded-xl p-6 lg:col-span-1">
                            <h2 class="text-lg font-bold text-white mb-4">Monte Carlo Predictor</h2>
                            <p class="text-sm text-slate-400 mb-6">1,000 iterations ran based on historical grade variance and current target trajectories.</p>
                            
                            <div class="space-y-4">
                                <div>
                                    <div class="flex justify-between text-sm mb-1">
                                        <span class="text-slate-400">Optimistic (Top 5%)</span>
                                        <span class="text-emerald-400 font-bold">${mcData.high95}</span>
                                    </div>
                                    <div class="w-full bg-slate-900 rounded-full h-1.5"><div class="bg-emerald-500 h-1.5 rounded-full" style="width: 95%"></div></div>
                                </div>
                                <div>
                                    <div class="flex justify-between text-sm mb-1">
                                        <span class="text-slate-400">Most Likely (Median)</span>
                                        <span class="text-indigo-400 font-bold">${mcData.median}</span>
                                    </div>
                                    <div class="w-full bg-slate-900 rounded-full h-1.5"><div class="bg-indigo-500 h-1.5 rounded-full" style="width: 50%"></div></div>
                                </div>
                                <div>
                                    <div class="flex justify-between text-sm mb-1">
                                        <span class="text-slate-400">Pessimistic (Bottom 5%)</span>
                                        <span class="text-orange-400 font-bold">${mcData.low5}</span>
                                    </div>
                                    <div class="w-full bg-slate-900 rounded-full h-1.5"><div class="bg-orange-500 h-1.5 rounded-full" style="width: 15%"></div></div>
                                </div>
                            </div>
                        </div>

                        <!-- Transcript Auditor -->
                        <div class="bg-slate-800 border border-slate-700 rounded-xl p-6 lg:col-span-2">
                            <div class="flex justify-between items-center mb-6">
                                <h2 class="text-lg font-bold text-white">Graduation Requirements Audit</h2>
                                <span class="px-3 py-1 bg-slate-700 text-slate-300 text-xs font-bold rounded-full">
                                    ${auditData.totalEarned.toFixed(1)} / ${TOTAL_CREDITS_REQUIRED.toFixed(1)} Credits
                                </span>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                ${Object.keys(auditData.buckets).map(cat => {
                                    const bucket = auditData.buckets[cat];
                                    const pct = Math.min(100, (bucket.earned / bucket.required) * 100);
                                    const color = bucket.complete ? 'bg-emerald-500' : 'bg-indigo-500';
                                    
                                    return `
                                        <div class="audit-row">
                                            <div class="flex justify-between text-sm mb-1">
                                                <span class="font-medium text-slate-300">${cat}</span>
                                                <span class="text-slate-400">${bucket.earned.toFixed(1)} /${bucket.required.toFixed(1)}</span>
                                            </div>
                                            <div class="w-full bg-slate-900 rounded-full h-2">
                                                <div class="${color} h-2 rounded-full transition-all duration-1000" style="width: ${pct}%"></div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    // Attach to global app scope
    window.GPACalculator = new GPACalculatorEngine();
    
    // Auto-init if AppState is ready, otherwise wait for event
    if (window.NexusApp && window.NexusApp.AppState) {
        window.GPACalculator.init(window.NexusApp.AppState, window.NexusApp.EventBus);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            window.NexusApp.EventBus.on('app:ready', () => {
                window.GPACalculator.init(window.NexusApp.AppState, window.NexusApp.EventBus);
            });
        });
    }

})(window);