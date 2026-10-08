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
const PCHS_LEGACY_COURSES = [
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

// Official Parkway course offerings (SchooLinks). Row format: "courseId|title|credits[|1 if Honors/AP]"
const PCHS_OFFERINGS = {
    "Fine Arts": `025950|Let's Create Together|0.5
027000|Design Arts|0.5
027020|Design Arts 2|0.5
027100|Drawing|0.5
027120|Drawing 2|0.5
027200|Ceramics|0.5
027220|Ceramics 2|0.5
027240|Sculpture|0.5
027250|Advanced 3D Studio|0.5
027300|Photography|0.5
027320|Photography 2|0.5
027500|Painting|0.5
027520|Painting 2|0.5
027550|Figure and Portrait|0.5
027810|Digital Design|0.5
027820|Digital Design 2|0.5
027950|Visual Arts Mentor|0.5
029561V/029562V|AP Art History|1|1
029781/029782|AP Drawing|1|1
029831/029832|AP 2D Art and Design|1|1
029841/029842|AP 3D Art and Design|1|1
055950|Let's Act Together|0.5
057720|Introduction to Theatre|0.5
057730|Comedy in Action|0.5
057740|Advanced Comedic Performance|0.5
057750|Theatre Production|0.5
057760|Technical Design and Construction|0.5
057800|Actor's Studio|0.5
057820|Directing|0.5
057870|Cinematography and Screenwriting|0.5
057950|Theatre Mentor|0.5
125950|Let's Make Music Together|0.5
127000|Chorus|0.5
127001/127002|Chorus|1
127041/127042|Concert Chorale|1
127151/127152|Jazz-A Cappella Choir|1
127171/127172|Concert Choir|1
127300|Strings|0.5
127411/127412|Concert Orchestra|1
127421/127422|Concert Orchestra 2|1
127431/127432|Chamber Orchestra|1
127441/127442|Symphonic Orchestra|1
127511/127512|Concert Band|1
127521/127522|Jazz Band|1
127530|Marching Arts|0.5
127560|Marching Band|0.125
127571/127572|Wind Ensemble|1
127581/127582|Symphonic Band|1
127610|Piano|0.5
127620|Piano 2|0.5
127630|Guitar|0.5
127640|Guitar 2|0.5
127720|Introduction to Music Theory|0.5
127730|Performing for Musical Theatre|0.5
127770|Music Technology|0.5
127950|Music Mentor|0.5
129701/129702|AP Music Theory|1|1
129701V/129702V|AP Music Theory (Virtual)|1|1`,
    "CTE": `035340|Let's Tech Together|0.5
037010|Introduction to Computer Technologies|0.5
037111/037112|Accounting 1|1
037111V/037112V|Accounting 1 (Virtual)|1
037270|Microsoft Office|0.5
037280|Branding and Design Concepts|0.5
037310|Introduction to Computer Science|0.5
037350|Introduction to Business|0.5
037490|Digital Animation|0.5
037500|Advanced Digital Media Lab|0.5
037550|Business Management|0.5
037570|Web Design 1|0.5
037590|Multimedia|0.5
037701/037702|Business, Marketing and Information Technology Internship|1
037741/037742|Business, Marketing and Information Technology Internship (Alt)|1
037950|Tech Mentor|0.5
038121/038122|Honors Accounting 2|1|1
038121V/038122V|Honors Accounting 2 (Virtual)|1|1
038131/038132|Honors Accounting 3|1|1
038311/038312|Honors Advanced Software Development|1|1
039241/039242|AP Cybersecurity|1|1
039251/039252|AP Computer Science Principles|1|1
039321/039322|AP Computer Science A|1|1
047751/047752|Marketing 1|1
047761/047762|Marketing 2|1
095950|Let's Cook Together|0.5
095960|Let's FACS Together|0.5
097000|Introduction to Culinary and Hospitality|0.5
097020|Intermediate Culinary and Hospitality|0.5
097050|Advanced Culinary and Hospitality|0.5
097110|International Cuisine|0.5
097240|Intro to Fashion Apparel and Housing Design|0.5
097250|Fashion Merchandising|0.5
097270|Fashion, Apparel, and Housing Design Capstone|0.5
097280|Fashion Design and Construction|0.5
097400|Human Relations|0.5
097420|Child Development 1|0.5
097460|Personal and Career Development|0.5
097540|Education and Training|0.5
097550|Housing and Interior Design|0.5
097570|Teaching Internship|0.5
097960|FACS Mentor|0.5
107050|Power, Energy, and Transportation Technology 1|0.5
107060|Power, Energy, and Transportation Technology 2|0.5
107070|Drafting|0.5
107120|Design and Technology 1|0.5
107130|Design and Technology 2|0.5
107240|Cybersecurity|0.5
107500|Construction Technology|0.5
107510|Advanced Construction Technology|0.5
107680|Robotics Technology 1|0.5
108201/108202|Honors Civil Engineering and Architecture|1|1
108711/108712|Honors Introduction to Engineering Design|1|1
108751/108752|Honors Principles of Engineering|1|1
207441/207442|Spark! Pre-Professional Health Science Academy|2
207481/207482|Spark! Incubator|2
207491/207492|Spark! Bioscience|2
207501/207502|Spark! Technology Solutions|2
207511/207512|Spark! Digital Media|2
207531/207532|Spark! Engineering Honors|2|1
207541/207542|Spark! Sports Medicine|1
207551/207552|Spark! Teaching & Learning|2`,
    "ELA": `057011/057012|English 1|1
057021/057022|English 2|1
057031/057032|English 3|1
057090|Contemporary World Literature|0.5
057120|Introduction to Composition|0.5
057130|Creative Writing 1|0.5
057140|Creative Writing 2|0.5
057200|College Composition|0.5
057300|Convergence Journalism 1|0.5
057301/057302|Convergence Journalism 1 (Full Year)|1
057311/057312|Newspaper 1|1
057321/057322|Newspaper 2|1
057331/057332|Newspaper 3|1
057341/057342|Newspaper 4|1
057350|Photojournalism|0.5
057411/057412|Yearbook 1|1
057421/057422|Yearbook 2|1
057431/057432|Yearbook 3|1
057441/057442|Yearbook 4|1
057480|Science Fiction and Fantasy Literature|0.5
057490|African American Literature|0.5
057530|Film Studies|0.5
057540|Comparative Mythology|0.5
057590|Reading Literature for Personal Enrichment|0.5
057600|Human Communication|0.5
057630|Public Speaking|0.5
057650|Advanced Broadcast and Production|0.5
057660|Debate|0.5
057670|Competitive Speech & Debate|0.5
057690|Words on Fire: Books that Challenge Society|0.5
057700|Broadcast and Production|0.5
057780|Performance Literature|0.5
057841/057842|Convergence Journalism 2|1
057851/057852|Convergence Journalism 3|1
057861/057862|Convergence Journalism 4|1
057890|Sports Literature and Composition|0.5
057920|The Poetics of Hip-Hop|0.5
058011/058012|English 1, Honors|1|1
058021/058022|English 2, Honors|1|1
058620|Honors Advanced Competitive Speech and Debate|0.5|1
059041/059042|AP English Literature and Composition|1|1
059201/059202|AP English Language and Composition|1|1`,
    "Math": `116201/116202|Geometry B|1
116341/116342|Building Math Competency 4|1
116351/116352|Consumer Math 1|1
116361/116362|Consumer Math 2|1
117101/117102|Algebra 1|1
117200|Geometry A (Semester)|0.5
117201/117202|Geometry A|1
117301/117302|Algebra 2|1
117310|Introduction to Computer Science (Math)|0.5
117401/117402|Algebra 2 with Trigonometry|1
117410|Trigonometry|0.5
117420|Algebra 3|0.5
117601/117602|College Algebra|1
117701/117702|Pre-Calculus|1
117800|Problem Based Applications Finite Math|0.5
117900|Statistics|0.5
118201/118202|Honors Geometry|1|1
118401/118402|Honors Algebra 2 with Trigonometry|1|1
118701/118702|Honors Pre-Calculus|1|1
118761V/118762V|Honors Calculus III|1|1
118771V/118772V|Honors Differential Equations|1|1
119251/119252|AP Computer Science Principles (Math)|1|1
119321/119322|AP Computer Science A (Math)|1|1
119801/119802|AP Calculus AB|1|1
119851/119852|AP Calculus BC|1|1
119901/119902|AP Statistics|1|1
111161/111162|Math Essentials|1
111311/111312|Parallel Bldg Math Comp 1|1
111321/111322|Parallel Bldg Math Comp 2|1
111331/111332|Parallel Bldg Math Comp 3|1
111341/111342|Parallel Bldg Math Comp 4|1
111351/111352|Parallel Consumer Math 1|1
111361/111362|Parallel Consumer Math 2|1
111401/111402|DHH Math Essentials|1
112001/112002|ELL Math Language and Concepts|1`,
    "Science": `136321/136322|Earth Systems|1
136331/136332|Biological Systems|1
136351/136352|Chemical and Physical Systems|1
137130|Biotechnology|0.5
137141/137142|Biology|1
137201/137202|Chemistry|1
137301/137302|Physics|1
137341/137342|Physical Science|1
137400|Animal Behavior|0.5
137450|Zoology|0.5
137461/137462|Human Anatomy and Physiology|1
137470|Exploring Medical Science|0.5
137480|Forensic Science|0.5
137490|Geology|0.5
137500|Environmental Science|0.5
137550|Meteorology|0.5
137560|Astronomy|0.5
137930|Science Laboratory Assistant|0.5
138141/138142|Honors Biology|1|1
138201/138202|Honors Chemistry|1|1
139151/139152|AP Biology|1|1
139251/139252|AP Chemistry|1|1
139321/139322|AP Physics C: Mechanics|1|1
139331/139332|AP Physics C: Electricity & Magnetism|1|1
139320V|AP Physics C: Mechanics (Virtual)|0.5|1
139330V|AP Physics C: Electricity and Magnetism (Virtual)|0.5|1
139411/139412|AP Physics 1|1|1
139421/139422|AP Physics 2|1|1
139501/139502|AP Environmental Science|1|1
131161/131162|Science Essentials|1
131301/131302|DHH Science Essentials|1
131321/131322|Parallel Earth Systems|1
131331/131332|Parallel Biological Systems|1
131351/131352|Parallel Physical Systems|1
132141/132142|ELL Biology|1
132341/132342|ELL Physical Science|1`,
    "Social Studies": `157021/157022|United States and World History 2: Emergence of the Modern World|1
157031/157032|United States and World History 3: The Modern World|1
157050|United States History IPBL|0.5
157100|United States Government|0.5
157350|History of St. Louis|0.5
157360|History of the American West|0.5
157370|Media in America|0.5
157550|Challenges to Democracy|0.5
157571/157572|African-American History|1
157700|Economics|0.5
157750|Crime and Law|0.5
157760|Contemporary Issues|0.5
157790|Sociology|0.5
157800|Psychology|0.5
157820|Environmental Issues|0.5
157830|Modern Warfare|0.5
157840|Philosophy and Ethics|0.5
157860|History Through Music|0.5
158340|Honors Colonial America|0.5|1
158530|Culture and History of China, Japan, and Korea|0.5|1
158540|Culture and History of the Middle East, India, and Southeast Asia|0.5|1
159011/159012|AP World History|1|1
159111/159112|AP US Government & Comparative Politics|1|1
159120|AP United States Government & Politics (Semester)|0.5|1
159121/159122|AP United States Government & Politics|1|1
159150|AP Comparative Government & Politics|0.5|1
159301/159302|AP United States History|1|1
159501/159502|AP European History|1|1
159511/159512|AP Human Geography|1|1
159601/159602|AP African American Studies|1|1
159710|AP Macroeconomics|0.5|1
159720|AP Microeconomics|0.5|1
159801/159802|AP Psychology|1|1
151021/151022|Parallel US & World History 2|1
151031/151032|Parallel US & World History 3|1
151100|Parallel US Government (Semester)|0.5
151101/151102|Parallel US Government|1
151161/151162|Social Studies Essentials|1
151200|DHH US Government|0.5
151301/151302|DHH Social Studies Essentials|1
152021/152022|ELL US and World History 2|1
152031/152032|ELL US and World History 3|1
152100|ELL Government|0.5`,
    "World Languages": `067011/067012|French 1|1
067021/067022|French 2|1
067031/067032|French 3|1
067201/067202|Roman Myth: An Introduction to Latin|1
067211/067212|Latin 1|1
067221/067222|Latin 2|1
067231/067232|Latin 3|1
067311/067312|Spanish 1|1
067321/067322|Spanish 2|1
067331/067332|Spanish 3|1
067351/067352|Spanish for Spanish Speakers|1
067511/067512|American Sign Language 1|1
067521/067522|American Sign Language 2|1
067531/067532|American Sign Language 3|1
067541/067542|American Sign Language 4|1
067511V/067512V|American Sign Language 1 (Virtual)|1
067521V/067522V|American Sign Language 2 (Virtual)|1
067531V/067532V|American Sign Language 3 (Virtual)|1
067541V/067542V|American Sign Language 4 (Virtual)|1
067611V/067612V|Chinese 1 (Virtual)|1
067621V/067622V|Chinese 2 (Virtual)|1
068041/068042|Honors French 4|1|1
068141/068142|Honors German 4|1|1
068241/068242|Honors Latin 4|1|1
068341/068342|Honors Spanish 4|1|1
069051/069052|AP French 5|1|1
069151/069152|AP German 5|1|1
069251/069252|AP Latin 5|1|1
069351/069352|AP Spanish 5|1|1`,
    "PE": `085950|Let's Move Together|0.5
087110|Physical Fitness Concepts|0.5
087140|Competitive Sports and Games|0.5
087150|Lifetime and Recreational Sports|0.5
087200|Strength and Conditioning|0.5
087220|Advanced Strength & Conditioning|0.5
087300|Adventure Pursuits|0.5
087400|Walking and Low-Impact Physical Activities|0.5
087820|Aquatic Experiences / SCUBA|0.5
087830|Lifeguard Training|0.5
087840|Aquatic Fitness / Learn To Swim|0.5
087900|Introduction to the Field of Sports Medicine|0.5
087950|P.E. Mentor|0.5
087960|Movement 2 Music|0.5
087970|Yoga for Fitness, Health and Wellbeing|0.5`,
    "Health": `071200|DHH Health & Family Education|0.5
072100|ELL Health and Family Education|0.5
077100|Health and Family Education|0.5`,
    "Personal Finance": `031100|DHH Alt Personal Finance|0.5
032100|ELL Personal Finance|0.5
037100|Personal Finance|0.5`,
    "Electives": `051011/051012|Alt English|1
051021/051022|Alt English 2|1
051151/051152|DHH Alt English|1
051161/051162|English Essentials|1
051211/051212|Parallel English 1|1
051221/051222|Parallel English 2|1
051231/051232|Parallel English 3|1
051241/051242|Parallel English 4|1
051301/051302|DHH English Essentials|1
051311/051312|DHH Parallel English 1|1
051321/051322|DHH Parallel English 2|1
051331/051332|DHH Parallel English 3|1
051341/051342|DHH Parallel English 4|1
052911/052912|ELL Level 1|2
052921/052922|ELL Level 2|2
052931/052932|ELL Level 3|1
052941/052942|ELL Level 4|1
052951/052952|ELL Essentials 1|1
052971/052972|ELL Essentials 2|1
990310|ASC Learning Support 09 (Semester)|0.5
990311/990312|ASC Learning Support 09|1
990320|ASC Learning Support 10 (Semester)|0.5
990321/990322|ASC Learning Support 10|1
990330|ASC Learning Support 10-12 (Semester)|0.5
990331/990332|ASC Learning Support 10-12|1
990340|ASC Learning Support Guided (Semester)|0.5
990341/990342|ASC Learning Support Guided|1
991031/991032|DHH Learning Strategies|1
993100|Leader Development 1|0.5
994001/994002|Work Experience - Off Site|1
994601/994602|DHH Work Experience In Building|1
994611/994612|DHH Work Experience-Off Site|1
994911/994912|Work Experience In Building|1
997001/997002|Cadet Teaching|1
997031/997032|Learning Strategies|1
999221/999222|Individual Instruction-KEYS|1
999231/999232|Individual Instruction-Social Skills|1
999241/999242|Individual Instruction-Exec Funct|1
999251/999252|Individual Instruction-Essential Social Skills|1
999261/999262|Individual Instruction-Rec and Leisure|1`
};

window.PCHS_COURSE_CATALOG = (() => {
    const seen = new Set();
    const official = [];
    Object.entries(PCHS_OFFERINGS).forEach(([category, block]) => {
        block.split('\n').forEach(line => {
            const [code, title, credits, weighted] = line.split('|');
            if (!code || seen.has(code)) return;
            seen.add(code);
            official.push({ code, title, credits: Number(credits), category, isWeighted: weighted === '1' });
        });
    });
    // Older saved courses reference the previous placeholder codes, so keep them resolvable but hidden from search.
    const legacy = PCHS_LEGACY_COURSES.filter(course => !seen.has(course.code)).map(course => ({ ...course, legacy: true }));
    return official.concat(legacy);
})();