/**
 * NEXUS STUDENT HUB - PCHS EDITION
 * FILE: pchsData.js
 * DESCRIPTION: Graduation requirements, grade scale, and course catalog reference data.
 */

// ============================================================================
// 1. GRADUATION REQUIREMENTS
// ============================================================================
window.PCHS_GRADUATION_REQUIREMENTS = {
    ELA: 4.0,
    Math: 3.0,
    Science: 3.0,
    SocialStudies: 3.0,
    FineArts: 1.0,
    CTE: 1.0,
    PE: 1.0,
    Health: 0.5,
    PersonalFinance: 0.5,
    Electives: 7.0,
    Total: 24.0
};

// ============================================================================
// 2. GRADE SCALE & GPA MAPPING (Based on Parkway Central Official Profile)
// Note: Parkway Central utilizes a +0.5 weighting system for standard Honors/AP 
// grades, but an A+ (formerly 'H') in an Honors/AP course receives a full 5.0.
// ============================================================================
window.PCHS_GRADE_SCALE = [
    { letter: "A+", minPct: 97.0, maxPct: 120.0, unweighted: 4.0, weighted: 5.0 }, 
    { letter: "A",  minPct: 93.0, maxPct: 96.99, unweighted: 4.0, weighted: 4.5 },
    { letter: "A-", minPct: 90.0, maxPct: 92.99, unweighted: 4.0, weighted: 4.5 },
    { letter: "B+", minPct: 87.0, maxPct: 89.99, unweighted: 3.0, weighted: 3.5 },
    { letter: "B",  minPct: 83.0, maxPct: 86.99, unweighted: 3.0, weighted: 3.5 },
    { letter: "B-", minPct: 80.0, maxPct: 82.99, unweighted: 3.0, weighted: 3.5 },
    { letter: "C+", minPct: 77.0, maxPct: 79.99, unweighted: 2.0, weighted: 2.5 },
    { letter: "C",  minPct: 73.0, maxPct: 76.99, unweighted: 2.0, weighted: 2.5 },
    { letter: "C-", minPct: 70.0, maxPct: 72.99, unweighted: 2.0, weighted: 2.5 },
    { letter: "D+", minPct: 67.0, maxPct: 69.99, unweighted: 1.0, weighted: 1.5 },
    { letter: "D",  minPct: 63.0, maxPct: 66.99, unweighted: 1.0, weighted: 1.5 },
    { letter: "D-", minPct: 60.0, maxPct: 62.99, unweighted: 1.0, weighted: 1.5 },
    { letter: "F",  minPct: 0.0,  maxPct: 59.99, unweighted: 0.0, weighted: 0.0 }
];

// ============================================================================
// 3. LATIN HONORS THRESHOLDS
// ============================================================================
window.PCHS_LATIN_HONORS = {
    SummaCumLaude: { min: 4.00, max: 5.00, title: "Summa Cum Laude" },
    MagnaCumLaude: { min: 3.75, max: 3.999, title: "Magna Cum Laude" },
    CumLaude:      { min: 3.50, max: 3.749, title: "Cum Laude" }
};

// ============================================================================
// 4. COURSE CATALOG
// ============================================================================
window.PCHS_COURSE_CATALOG = [
    // --- VISUAL ARTS ---
    { code: "ART101", title: "Design Arts", credits: 0.5, category: "Visual Arts", isWeighted: false },
    { code: "ART102", title: "Drawing", credits: 0.5, category: "Visual Arts", isWeighted: false },
    { code: "ART201", title: "Ceramics", credits: 0.5, category: "Visual Arts", isWeighted: false },
    { code: "ART202", title: "Sculpture", credits: 0.5, category: "Visual Arts", isWeighted: false },
    { code: "ART203", title: "Photography", credits: 0.5, category: "Visual Arts", isWeighted: false },
    { code: "ART301", title: "Advanced Drawing", credits: 0.5, category: "Visual Arts", isWeighted: false },
    { code: "ART302", title: "Advanced Ceramics", credits: 0.5, category: "Visual Arts", isWeighted: false },
    { code: "ART303", title: "Advanced Photography", credits: 0.5, category: "Visual Arts", isWeighted: false },
    { code: "ART401", title: "AP Studio Art: 2-D Design", credits: 1.0, category: "Visual Arts", isWeighted: true },
    { code: "ART402", title: "AP Studio Art: 3-D Design", credits: 1.0, category: "Visual Arts", isWeighted: true },
    { code: "ART403", title: "AP Studio Art: Drawing", credits: 1.0, category: "Visual Arts", isWeighted: true },
    { code: "ART404", title: "AP Art History", credits: 1.0, category: "Visual Arts", isWeighted: true },
    { code: "ART501", title: "Digital Design", credits: 0.5, category: "Visual Arts", isWeighted: false },
    { code: "ART502", title: "Painting", credits: 0.5, category: "Visual Arts", isWeighted: false },
    { code: "ART503", title: "Advanced Painting", credits: 0.5, category: "Visual Arts", isWeighted: false },
    { code: "ART504", title: "Graphic Design I", credits: 0.5, category: "Visual Arts", isWeighted: false },
    { code: "ART505", title: "Graphic Design II", credits: 0.5, category: "Visual Arts", isWeighted: false },
    { code: "ART506", title: "Metalsmithing", credits: 0.5, category: "Visual Arts", isWeighted: false },
    { code: "ART507", title: "Fibers", credits: 0.5, category: "Visual Arts", isWeighted: false },
    { code: "ART508", title: "Animation", credits: 0.5, category: "Visual Arts", isWeighted: false },
    
    // --- BUSINESS & TECHNOLOGY ---
    { code: "BUS101", title: "Introduction to Business", credits: 0.5, category: "Business", isWeighted: false },
    { code: "BUS102", title: "Accounting I", credits: 1.0, category: "Business", isWeighted: false },
    { code: "BUS201", title: "Accounting II", credits: 1.0, category: "Business", isWeighted: true },
    { code: "BUS202", title: "Business Law", credits: 0.5, category: "Business", isWeighted: false },
    { code: "BUS203", title: "Marketing I", credits: 0.5, category: "Business", isWeighted: false },
    { code: "BUS301", title: "Marketing II", credits: 0.5, category: "Business", isWeighted: false },
    { code: "BUS302", title: "Entrepreneurship", credits: 0.5, category: "Business", isWeighted: false },
    { code: "BUS303", title: "Personal Finance", credits: 0.5, category: "Personal Finance", isWeighted: false },
    { code: "BUS401", title: "Web Design", credits: 0.5, category: "Business", isWeighted: false },
    { code: "BUS402", title: "AP Macroeconomics", credits: 0.5, category: "Business", isWeighted: true },
    { code: "BUS403", title: "AP Microeconomics", credits: 0.5, category: "Business", isWeighted: true },
    { code: "BUS501", title: "Business Management", credits: 0.5, category: "Business", isWeighted: false },
    { code: "BUS502", title: "Sports and Entertainment Marketing", credits: 0.5, category: "Business", isWeighted: false },
    { code: "BUS503", title: "International Business", credits: 0.5, category: "Business", isWeighted: false },
    
    // --- COMPUTER SCIENCE ---
    { code: "CS101", title: "Computer Science Essentials", credits: 0.5, category: "CS", isWeighted: false },
    { code: "CS201", title: "Cybersecurity", credits: 1.0, category: "CS", isWeighted: true },
    { code: "CS301", title: "AP Computer Science Principles", credits: 1.0, category: "CS", isWeighted: true },
    { code: "CS401", title: "AP Computer Science A", credits: 1.0, category: "CS", isWeighted: true },
    { code: "CS501", title: "App Development", credits: 0.5, category: "CS", isWeighted: false },
    { code: "CS502", title: "Python Programming", credits: 0.5, category: "CS", isWeighted: false },
    { code: "CS503", title: "Data Structures & Algorithms (Honors)", credits: 1.0, category: "CS", isWeighted: true },

    // --- ENGLISH ---
    { code: "ENG101", title: "English 1", credits: 1.0, category: "ELA", isWeighted: false },
    { code: "ENG102", title: "Honors English 1", credits: 1.0, category: "ELA", isWeighted: true },
    { code: "ENG201", title: "English 2", credits: 1.0, category: "ELA", isWeighted: false },
    { code: "ENG202", title: "Honors English 2", credits: 1.0, category: "ELA", isWeighted: true },
    { code: "ENG301", title: "English 3", credits: 1.0, category: "ELA", isWeighted: false },
    { code: "ENG302", title: "AP English Language and Composition", credits: 1.0, category: "ELA", isWeighted: true },
    { code: "ENG401", title: "English 4", credits: 1.0, category: "ELA", isWeighted: false },
    { code: "ENG402", title: "AP English Literature and Composition", credits: 1.0, category: "ELA", isWeighted: true },
    { code: "ENG501", title: "Creative Writing", credits: 0.5, category: "ELA", isWeighted: false },
    { code: "ENG502", title: "Speech and Debate", credits: 0.5, category: "ELA", isWeighted: false },
    { code: "ENG503", title: "Journalism I", credits: 1.0, category: "ELA", isWeighted: false },
    { code: "ENG504", title: "Journalism II: Newspaper", credits: 1.0, category: "ELA", isWeighted: false },
    { code: "ENG505", title: "Journalism II: Yearbook", credits: 1.0, category: "ELA", isWeighted: false },
    { code: "ENG506", title: "African American Literature", credits: 0.5, category: "ELA", isWeighted: false },
    { code: "ENG507", title: "Contemporary Fiction", credits: 0.5, category: "ELA", isWeighted: false },
    { code: "ENG508", title: "Mythology", credits: 0.5, category: "ELA", isWeighted: false },

    // --- WORLD LANGUAGES ---
    { code: "WLG101", title: "French 1", credits: 1.0, category: "World Languages", isWeighted: false },
    { code: "WLG102", title: "French 2", credits: 1.0, category: "World Languages", isWeighted: false },
    { code: "WLG103", title: "French 3", credits: 1.0, category: "World Languages", isWeighted: false },
    { code: "WLG104", title: "Honors French 4", credits: 1.0, category: "World Languages", isWeighted: true },
    { code: "WLG105", title: "AP French Language", credits: 1.0, category: "World Languages", isWeighted: true },
    { code: "WLG201", title: "Spanish 1", credits: 1.0, category: "World Languages", isWeighted: false },
    { code: "WLG202", title: "Spanish 2", credits: 1.0, category: "World Languages", isWeighted: false },
    { code: "WLG203", title: "Spanish 3", credits: 1.0, category: "World Languages", isWeighted: false },
    { code: "WLG204", title: "Honors Spanish 4", credits: 1.0, category: "World Languages", isWeighted: true },
    { code: "WLG205", title: "AP Spanish Language", credits: 1.0, category: "World Languages", isWeighted: true },
    { code: "WLG301", title: "German 1", credits: 1.0, category: "World Languages", isWeighted: false },
    { code: "WLG302", title: "German 2", credits: 1.0, category: "World Languages", isWeighted: false },
    { code: "WLG303", title: "German 3", credits: 1.0, category: "World Languages", isWeighted: false },
    { code: "WLG304", title: "Honors German 4", credits: 1.0, category: "World Languages", isWeighted: true },
    { code: "WLG305", title: "AP German Language", credits: 1.0, category: "World Languages", isWeighted: true },
    { code: "WLG401", title: "Latin 1", credits: 1.0, category: "World Languages", isWeighted: false },
    { code: "WLG402", title: "Latin 2", credits: 1.0, category: "World Languages", isWeighted: false },
    { code: "WLG403", title: "Latin 3", credits: 1.0, category: "World Languages", isWeighted: false },
    { code: "WLG404", title: "AP Latin", credits: 1.0, category: "World Languages", isWeighted: true },
    { code: "WLG501", title: "American Sign Language 1", credits: 1.0, category: "World Languages", isWeighted: false },
    { code: "WLG502", title: "American Sign Language 2", credits: 1.0, category: "World Languages", isWeighted: false },

    // --- PE & HEALTH ---
    { code: "PE101", title: "Physical Fitness & Wellness", credits: 0.5, category: "PE", isWeighted: false },
    { code: "PE102", title: "Team Sports", credits: 0.5, category: "PE", isWeighted: false },
    { code: "PE201", title: "Lifetime Fitness", credits: 0.5, category: "PE", isWeighted: false },
    { code: "PE202", title: "Strength & Conditioning I", credits: 0.5, category: "PE", isWeighted: false },
    { code: "PE301", title: "Strength & Conditioning II", credits: 0.5, category: "PE", isWeighted: false },
    { code: "HLT101", title: "Health", credits: 0.5, category: "Health", isWeighted: false },
    { code: "PE401", title: "Yoga and Mindfulness", credits: 0.5, category: "PE", isWeighted: false },
    { code: "PE402", title: "Aquatics", credits: 0.5, category: "PE", isWeighted: false },

    // --- FAMILY & CONSUMER SCIENCES (FCS) ---
    { code: "FCS101", title: "Culinary Arts I", credits: 0.5, category: "CTE", isWeighted: false },
    { code: "FCS102", title: "Culinary Arts II", credits: 0.5, category: "CTE", isWeighted: false },
    { code: "FCS201", title: "Child Development I", credits: 0.5, category: "CTE", isWeighted: false },
    { code: "FCS202", title: "Child Development II", credits: 0.5, category: "CTE", isWeighted: false },
    { code: "FCS301", title: "Interior Design", credits: 0.5, category: "CTE", isWeighted: false },
    { code: "FCS302", title: "Fashion Construction", credits: 0.5, category: "CTE", isWeighted: false },
    { code: "FCS401", title: "Relationships", credits: 0.5, category: "CTE", isWeighted: false },

    // --- ENGINEERING (PLTW) ---
    { code: "EGR101", title: "Introduction to Engineering Design", credits: 1.0, category: "CTE", isWeighted: true },
    { code: "EGR201", title: "Principles of Engineering", credits: 1.0, category: "CTE", isWeighted: true },
    { code: "EGR301", title: "Civil Engineering & Architecture", credits: 1.0, category: "CTE", isWeighted: true },
    { code: "EGR401", title: "Engineering Design & Development", credits: 1.0, category: "CTE", isWeighted: true },
    
    // --- MATHEMATICS ---
    { code: "MAT101", title: "Algebra 1", credits: 1.0, category: "Math", isWeighted: false },
    { code: "MAT102", title: "Geometry", credits: 1.0, category: "Math", isWeighted: false },
    { code: "MAT103", title: "Honors Geometry", credits: 1.0, category: "Math", isWeighted: true },
    { code: "MAT201", title: "Algebra 2", credits: 1.0, category: "Math", isWeighted: false },
    { code: "MAT202", title: "Honors Algebra 2", credits: 1.0, category: "Math", isWeighted: true },
    { code: "MAT301", title: "Pre-Calculus", credits: 1.0, category: "Math", isWeighted: false },
    { code: "MAT302", title: "Honors Pre-Calculus", credits: 1.0, category: "Math", isWeighted: true },
    { code: "MAT401", title: "College Algebra", credits: 1.0, category: "Math", isWeighted: false },
    { code: "MAT402", title: "AP Calculus AB", credits: 1.0, category: "Math", isWeighted: true },
    { code: "MAT403", title: "AP Calculus BC", credits: 1.0, category: "Math", isWeighted: true },
    { code: "MAT404", title: "AP Statistics", credits: 1.0, category: "Math", isWeighted: true },
    { code: "MAT501", title: "Calculus III / Differential Equations", credits: 1.0, category: "Math", isWeighted: true },
    { code: "MAT502", title: "Trigonometry", credits: 0.5, category: "Math", isWeighted: false },

    // --- MUSIC ---
    { code: "MUS101", title: "Concert Band", credits: 1.0, category: "Fine Arts", isWeighted: false },
    { code: "MUS102", title: "Symphonic Band", credits: 1.0, category: "Fine Arts", isWeighted: false },
    { code: "MUS103", title: "Jazz Band", credits: 1.0, category: "Fine Arts", isWeighted: false },
    { code: "MUS201", title: "Concert Orchestra", credits: 1.0, category: "Fine Arts", isWeighted: false },
    { code: "MUS202", title: "Symphonic Orchestra", credits: 1.0, category: "Fine Arts", isWeighted: false },
    { code: "MUS301", title: "Concert Choir", credits: 1.0, category: "Fine Arts", isWeighted: false },
    { code: "MUS302", title: "Chamber Choir", credits: 1.0, category: "Fine Arts", isWeighted: true },
    { code: "MUS401", title: "AP Music Theory", credits: 1.0, category: "Fine Arts", isWeighted: true },
    { code: "MUS501", title: "Guitar I", credits: 0.5, category: "Fine Arts", isWeighted: false },
    { code: "MUS502", title: "Music Technology", credits: 0.5, category: "Fine Arts", isWeighted: false },

    // --- SCIENCE ---
    { code: "SCI101", title: "Biology", credits: 1.0, category: "Science", isWeighted: false },
    { code: "SCI102", title: "Honors Biology", credits: 1.0, category: "Science", isWeighted: true },
    { code: "SCI201", title: "Chemistry", credits: 1.0, category: "Science", isWeighted: false },
    { code: "SCI202", title: "Honors Chemistry", credits: 1.0, category: "Science", isWeighted: true },
    { code: "SCI301", title: "Physics", credits: 1.0, category: "Science", isWeighted: false },
    { code: "SCI302", title: "AP Physics 1", credits: 1.0, category: "Science", isWeighted: true },
    { code: "SCI303", title: "AP Physics C", credits: 1.0, category: "Science", isWeighted: true },
    { code: "SCI401", title: "AP Biology", credits: 1.0, category: "Science", isWeighted: true },
    { code: "SCI402", title: "AP Chemistry", credits: 1.0, category: "Science", isWeighted: true },
    { code: "SCI403", title: "AP Environmental Science", credits: 1.0, category: "Science", isWeighted: true },
    { code: "SCI501", title: "Anatomy & Physiology", credits: 1.0, category: "Science", isWeighted: true },
    { code: "SCI502", title: "Earth & Space Science", credits: 1.0, category: "Science", isWeighted: false },
    { code: "SCI503", title: "Forensic Science", credits: 0.5, category: "Science", isWeighted: false },
    { code: "SCI504", title: "Zoology", credits: 0.5, category: "Science", isWeighted: false },

    // --- SOCIAL STUDIES ---
    { code: "SOC101", title: "Modern United States History", credits: 1.0, category: "Social Studies", isWeighted: false },
    { code: "SOC102", title: "Honors Modern US History", credits: 1.0, category: "Social Studies", isWeighted: true },
    { code: "SOC201", title: "World History", credits: 1.0, category: "Social Studies", isWeighted: false },
    { code: "SOC202", title: "AP World History", credits: 1.0, category: "Social Studies", isWeighted: true },
    { code: "SOC301", title: "US Government", credits: 0.5, category: "Social Studies", isWeighted: false },
    { code: "SOC302", title: "AP US Government", credits: 1.0, category: "Social Studies", isWeighted: true },
    { code: "SOC401", title: "AP US History", credits: 1.0, category: "Social Studies", isWeighted: true },
    { code: "SOC402", title: "AP European History", credits: 1.0, category: "Social Studies", isWeighted: true },
    { code: "SOC501", title: "Psychology", credits: 0.5, category: "Social Studies", isWeighted: false },
    { code: "SOC502", title: "AP Psychology", credits: 1.0, category: "Social Studies", isWeighted: true },
    { code: "SOC503", title: "Sociology", credits: 0.5, category: "Social Studies", isWeighted: false },
    { code: "SOC504", title: "Contemporary Issues", credits: 0.5, category: "Social Studies", isWeighted: false },
    { code: "SOC505", title: "History of St. Louis", credits: 0.5, category: "Social Studies", isWeighted: false },

    // --- SPARK! PROGRAMS (Experiential Learning) ---
    { code: "SPK101", title: "Spark! Technology Solutions", credits: 1.0, category: "CTE", isWeighted: true },
    { code: "SPK102", title: "Spark! Sports Medicine", credits: 1.0, category: "CTE", isWeighted: true },
    { code: "SPK103", title: "Spark! Incubator (Entrepreneurship)", credits: 1.0, category: "CTE", isWeighted: true },
    { code: "SPK104", title: "Spark! Health Sciences", credits: 1.0, category: "CTE", isWeighted: true },
    { code: "SPK105", title: "Spark! Engineering", credits: 1.0, category: "CTE", isWeighted: true },
    { code: "SPK106", title: "Spark! Teaching & Learning", credits: 1.0, category: "CTE", isWeighted: true },

    // --- MULTI-DEPARTMENT / MISCELLANEOUS ---
    { code: "MIS101", title: "Study Hall S1", credits: 0.0, category: "Electives", isWeighted: false },
    { code: "MIS102", title: "Study Hall S2", credits: 0.0, category: "Electives", isWeighted: false },
    { code: "MIS201", title: "ACT/SAT Prep", credits: 0.5, category: "Electives", isWeighted: false },
    { code: "MIS202", title: "A+ Tutoring", credits: 0.5, category: "Electives", isWeighted: false },
    { code: "MIS301", title: "Peer Teaching", credits: 0.5, category: "Electives", isWeighted: false },
    { code: "MIS401", title: "Office Aide", credits: 0.5, category: "Electives", isWeighted: false }
];