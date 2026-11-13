/**
 * StudBud Classrooms
 * Teachers (account tag "teacher" at a Parkway school) pick the courses they teach from their school's catalog,
 * publish flashcard sets and manage class resources without access to students' private schoolwork or activity.
 * Students at the same school who have that course in their course list get access automatically (no join codes).
 * The visible tab polls every 30 seconds; teacher drafts are left untouched until the user leaves the editor.
 */
(function (window) {
    'use strict';

    const ENROLLMENT_EVERY_MS = 5 * 60 * 1000;
    const REFRESH_EVERY_MS = 30 * 1000;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const ago = iso => {
        if (!iso) return 'Never';
        const diff = Date.now() - new Date(iso).getTime();
        if (!Number.isFinite(diff)) return 'Never';
        const days = Math.floor(diff / 86400000);
        if (days <= 0) return 'Today';
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days} days ago`;
        return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
    };
    const personName = person => person?.username || 'Student';

    // "term<TAB>definition", "term - definition", "term: definition" or "term, definition" per line.
    function parseCardLines(text) {
        return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
            const match = line.match(/^(.+?)\s*(?:\t|\s[-–—]\s|::|:\s|\s=\s|,\s)\s*(.+)$/);
            return match ? { front: match[1].trim().slice(0, 1000), back: match[2].trim().slice(0, 2000) } : null;
        }).filter(Boolean);
    }

    class Classrooms {
        constructor(app) {
            this.app = app;
            this.teacherData = null;
            this.detail = null;
            this.detailTab = 'sets';
            this.studentData = null;
            this.editingDeck = null;
            this.lastSync = 0;
            this.lastCodesKey = '';
            this.syncTimer = null;
            this.loading = false;
            this.courseIndex = -1;
            this.addingCourse = false;
            this.requestId = 0;
            this.context = '';
            this.syncing = false;
            this.polling = false;
        }

        get view() { return document.getElementById('classes-view'); }
        get root() { return document.getElementById('classes-root'); }
        call(fn, args) { return window.StudBudCommunityGames.classCall(fn, args); }
        isTeacher() { return (this.app.userTags || []).includes('teacher'); }
        courseSharingEnabled() { return this.app.AppState.get('settings')?.shareSchoolCourses === true; }

        available() {
            const cloud = window.StudBudCloud;
            return Boolean(cloud?.user && cloud.accountReady !== false && !cloud.offlineMode && !cloud.isGuest?.() && this.app.isParkwaySchool?.());
        }

        contextKey() {
            return [window.StudBudCloud?.user?.id || '', this.app.currentSchool?.() || '', this.isTeacher(), this.courseSharingEnabled()].join('|');
        }

        resetContext() {
            const key = this.available() ? this.contextKey() : '';
            if (key === this.context) return false;
            this.context = key;
            this.requestId++;
            this.teacherData = this.studentData = this.detail = this.editingDeck = null;
            this.lastSync = 0;
            this.lastCodesKey = '';
            this.loading = false;
            clearTimeout(this.syncTimer);
            return true;
        }

        currentRequest(id, key) {
            return this.available() && id === this.requestId && key === this.contextKey();
        }

        visible() {
            return document.visibilityState !== 'hidden' && this.view && !this.view.classList.contains('hidden');
        }

        async refreshVisible() {
            if (this.app.schoolCommunity && this.isTeacher() && !this.root) return;
            if (!this.available() || !this.visible() || this.loading || this.polling || this.addingCourse) return;
            // Never replace a teacher's draft or an actively used roster control during polling.
            if (this.editingDeck || this.detailTab === 'settings' && this.detail
                || this.root?.contains(document.activeElement)) return;
            this.polling = true;
            const key = this.contextKey();
            const id = this.requestId;
            const classId = this.detail?.id;
            const communityRequest = this.app.schoolCommunity?.request;
            try {
                if (this.isTeacher()) {
                    const data = await this.call(classId ? 'studbud_teacher_class_detail' : 'studbud_teacher_classes', classId ? { p_class_id: classId } : undefined);
                    if (!this.currentRequest(id, key) || !this.visible() || this.editingDeck
                        || this.app.schoolCommunity && (!this.root || communityRequest !== this.app.schoolCommunity.request)
                        || this.detailTab === 'settings' && this.detail || this.root?.contains(document.activeElement)) return;
                    if (classId) {
                        this.detail = data;
                        if (this.app.schoolCommunity) this.app.schoolCommunity.teacherDetail = data;
                        this.renderTeacherDetail();
                    }
                    else { this.teacherData = data; this.renderTeacherHome(); }
                } else {
                    await this.syncEnrollment(true);
                }
            } catch (error) {
                if (this.currentRequest(id, key)) this.status(this.app.friendlyErrorMessage(error), 'error');
            } finally {
                this.polling = false;
            }
        }

        init() {
            const view = this.view;
            if (!view || view.dataset.bound) return;
            view.dataset.bound = '1';
            view.addEventListener('click', event => this.onClick(event));
            view.addEventListener('submit', event => this.onSubmit(event));
            view.addEventListener('input', event => this.onInput(event));
            view.addEventListener('change', event => this.onInput(event));
            view.addEventListener('keydown', event => this.onKeydown(event));
            view.addEventListener('focusin', event => {
                if (event.target.id === 'teacher-course-search' && event.target.value.trim()) this.renderCourseResults(event.target.value);
            });
            document.addEventListener('click', event => {
                if (!event.target.closest?.('.teacher-course-combobox')) this.hideCourseResults();
            });
            this.app.EventBus.on('courses:updated', () => { this.studentData = null; this.scheduleSync(350, true); });
            this.app.EventBus.on('state:restored', () => { this.resetContext(); this.scheduleSync(350, true); });
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') { this.refreshVisible(); this.scheduleSync(); }
            });
            window.addEventListener?.('online', () => { this.refreshNav(); this.refreshVisible(); });
            this.pollTimer = setInterval(() => {
                if (document.hidden) return;
                if (this.visible()) this.refreshVisible();
                else this.scheduleSync(0);
            }, REFRESH_EVERY_MS);
        }

        refreshNav() {
            this.init();
            const changed = this.resetContext();
            if (changed && this.visible()) this.render();
            const item = document.getElementById('classes-nav-item');
            if (!item) return;
            const show = this.available();
            document.getElementById('school-community-privacy')?.classList.toggle('hidden', !show);
            item.classList.toggle('hidden', !show);
            const label = item.querySelector('span');
            if (label) label.textContent = 'Classrooms';
            const icon = item.querySelector('i');
            if (icon) icon.className = this.isTeacher() ? 'fas fa-chalkboard-user' : 'fas fa-school';
            if (['gpa', 'classes', 'school-community', 'grade-scenarios', 'analytics', 'class'].includes(this.app.Router?.activeRoute)) {
                this.app.Router.renderWorkspaceTabs();
            }
            if (show && !this.isTeacher()) this.scheduleSync(1500);
        }

        status(message, type = '') {
            const node = document.getElementById('classes-status');
            if (!node) return this.app.schoolCommunity?.status(message, type === 'error');
            node.textContent = message || '';
            node.className = `classes-status${type ? ` ${type}` : ''}`;
        }

        async render() {
            if (this.app.schoolCommunity) return this.app.schoolCommunity.render();
            this.resetContext();
            this.init();
            const root = this.root;
            if (!root) return;
            if (!this.available()) {
                root.innerHTML = `<div class="glass-card empty-state">Classes work for signed-in students and teachers at Parkway Central, North, South and West. Pick your school in Settings and make sure you are online.</div>`;
                return;
            }
            if (this.isTeacher()) {
                const title = document.getElementById('active-view-title');
                const guide = document.getElementById('page-guide');
                if (title) title.textContent = 'Teach';
                if (guide) guide.textContent = 'Your classes and shared flashcard sets.';
                if (this.detail) return this.openClass(this.detail.id);
                return this.loadTeacher();
            }
            return this.loadStudent();
        }

        // ------------------------------------------------------------------ TEACHER
        async loadTeacher() {
            if (this.app.schoolCommunity) return this.app.schoolCommunity.render();
            const id = ++this.requestId;
            const key = this.contextKey();
            this.loading = true;
            this.root.innerHTML = '<div class="classes-skeleton" aria-busy="true"><span></span><span></span><span></span></div>';
            try {
                const data = await this.call('studbud_teacher_classes');
                if (!this.currentRequest(id, key)) return;
                this.teacherData = data;
                this.renderTeacherHome();
            } catch (error) {
                if (this.currentRequest(id, key)) this.root.innerHTML = `<div class="glass-card empty-state">${esc(this.app.friendlyErrorMessage(error))}</div>`;
            } finally {
                if (id === this.requestId) this.loading = false;
            }
        }

        renderTeacherHome() {
            const school = this.app.schoolShortName?.() || 'your school';
            this.root.innerHTML = `
                <section class="glass-card teacher-new-class">
                    <h3><i class="fas fa-plus"></i> Add a course you teach</h3>
                    <form id="teacher-class-form" class="teacher-class-form" autocomplete="off">
                        <label for="teacher-course-search" class="teacher-course-search-label">Search the ${esc(school)} course catalog</label>
                        <div class="teacher-course-combobox">
                            <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
                            <input id="teacher-course-search" type="search" placeholder="e.g. AP Biology, Algebra 2, 0412" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="teacher-course-results" aria-describedby="teacher-course-help">
                            <div id="teacher-course-results" class="teacher-course-results hidden" role="listbox" aria-label="${esc(school)} courses"></div>
                        </div>
                        <small id="teacher-course-help" class="muted">Only ${esc(school)} courses are listed. Use ↑ ↓ and Enter, or tap a course to add it. Courses you already teach are checked.</small>
                    </form>
                </section>
                <p id="classes-status" class="classes-status" role="status" aria-live="polite"></p>`;
        }

        teacherClassCard(item) {
            return `<article class="glass-card teacher-class-card">
                <header>
                    <span class="class-code-chip">${esc(item.course_code)}</span>
                    ${item.section ? `<span class="class-section">${esc(item.section)}</span>` : ''}
                </header>
                <h3>${esc(item.title)}</h3>
                <div class="teacher-class-stats">
                    <div><strong>${Number(item.deck_count || 0)}</strong><small>sets</small></div>
                </div>
                <button type="button" class="primary-btn" data-class-action="open-class" data-id="${esc(item.id)}">Open class <i class="fas fa-arrow-right"></i></button>
            </article>`;
        }

        renderCourseResults(query) {
            const box = document.getElementById('teacher-course-results');
            const input = document.getElementById('teacher-course-search');
            if (!box) return;
            this.courseIndex = -1;
            input?.removeAttribute('aria-activedescendant');
            const text = String(query || '').trim();
            if (!text) { this.hideCourseResults(); return; }
            const schoolId = this.app.currentSchool?.() || 'pchs';
            const schools = window.STUDBUD_SCHOOLS;
            const matches = schools?.search
                ? schools.search(schoolId, text, 10)
                : (this.app.schoolCatalog?.() || []).filter(course => `${course.code} ${course.title}`.toLowerCase().includes(text.toLowerCase())).slice(0, 10);
            const taught = new Set((this.teacherData?.classes || []).map(item => item.course_code));
            box.innerHTML = matches.length ? matches.map((course, index) => {
                const have = taught.has(course.code);
                return `<button type="button" id="teacher-course-option-${index}" role="option" tabindex="-1" class="teacher-course-option${have ? ' added' : ''}" data-class-action="add-course" data-code="${esc(course.code)}" aria-selected="false"${have ? ' aria-disabled="true" disabled' : ''}>
                    <span><strong>${esc(course.title)}${course.isWeighted ? ' <em class="course-weighted-pill">Weighted</em>' : ''}</strong><small>${esc(course.code)}${course.category ? ` · ${esc(course.category)}` : ''} · ${Number(course.credits) || 0} cr${have ? ' · You teach this' : ''}</small></span>
                    <i class="fas ${have ? 'fa-circle-check' : 'fa-circle-plus'}" aria-hidden="true"></i></button>`;
            }).join('')
                : `<p class="teacher-course-empty muted">No ${esc(this.app.schoolShortName?.() || '')} courses match “${esc(text)}”. Try fewer or shorter words.</p>`;
            box.classList.remove('hidden');
            input?.setAttribute('aria-expanded', 'true');
        }

        hideCourseResults() {
            const box = document.getElementById('teacher-course-results');
            if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
            const input = document.getElementById('teacher-course-search');
            input?.setAttribute('aria-expanded', 'false');
            input?.removeAttribute('aria-activedescendant');
            this.courseIndex = -1;
        }

        courseOptions() {
            return Array.from(document.querySelectorAll('#teacher-course-results .teacher-course-option:not([disabled])'));
        }

        highlightCourse(index) {
            const options = this.courseOptions();
            if (!options.length) return;
            this.courseIndex = Math.max(0, Math.min(index, options.length - 1));
            const input = document.getElementById('teacher-course-search');
            options.forEach((option, i) => {
                const selected = i === this.courseIndex;
                option.setAttribute('aria-selected', String(selected));
                option.classList.toggle('active', selected);
                if (selected) {
                    input?.setAttribute('aria-activedescendant', option.id);
                    option.scrollIntoView?.({ block: 'nearest' });
                }
            });
        }

        onKeydown(event) {
            if (event.target.id !== 'teacher-course-search') return;
            const box = document.getElementById('teacher-course-results');
            const open = box && !box.classList.contains('hidden');
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (!open) this.renderCourseResults(event.target.value);
                const current = this.courseIndex ?? -1;
                this.highlightCourse(event.key === 'ArrowDown' ? current + 1 : (current < 0 ? this.courseOptions().length - 1 : current - 1));
            } else if (event.key === 'Escape' && open) {
                event.preventDefault();
                event.stopPropagation();
                this.hideCourseResults();
            } else if (event.key === 'Enter') {
                event.preventDefault();
                const options = this.courseOptions();
                const pick = options[this.courseIndex >= 0 ? this.courseIndex : 0];
                if (!pick) {
                    this.status(open ? 'That course is already in your classes, or nothing matches.' : 'Search for a course, then pick it from the list.', 'error');
                    return;
                }
                this.addCourse(pick.dataset.code).catch(error => this.status(this.app.friendlyErrorMessage(error), 'error'));
            }
        }

        async openClass(id) {
            if (this.app.schoolCommunity) {
                const community = this.app.schoolCommunity;
                const item = (this.teacherData?.classes || []).find(item => item.id === id);
                const course = (community.classes || []).find(course => item &&
                    this.courseMatches({ code: course.course_code }, item.course_code));
                const result = community.open(course?.id || id, course?.title || item?.title);
                community.tab = 'teacher';
                return result;
            }
            const request = ++this.requestId;
            const key = this.contextKey();
            this.loading = true;
            this.root.innerHTML = '<div class="classes-skeleton" aria-busy="true"><span></span><span></span><span></span></div>';
            try {
                const data = await this.call('studbud_teacher_class_detail', { p_class_id: id });
                if (!this.currentRequest(request, key)) return;
                this.detail = data;
                this.editingDeck = null;
                this.renderTeacherDetail();
                this.view?.scrollIntoView?.({ block: 'start' });
            } catch (error) {
                if (!this.currentRequest(request, key)) return;
                this.detail = null;
                this.root.innerHTML = `<div class="glass-card empty-state">${esc(this.app.friendlyErrorMessage(error))}</div>`;
            } finally {
                if (request === this.requestId) this.loading = false;
            }
        }

        async addCourse(code) {
            const course = (this.app.schoolCatalog?.() || []).find(entry => entry.code === code);
            if (!course) throw new Error(`Pick a ${this.app.schoolShortName?.() || 'school'} course from the list first.`);
            if (this.addingCourse) return;
            if ((this.teacherData?.classes || []).some(item => item.course_code === course.code)) {
                this.status(`You already teach ${course.title}.`);
                return;
            }
            this.addingCourse = true;
            const box = document.getElementById('teacher-course-results');
            box?.setAttribute('aria-busy', 'true');
            box?.querySelectorAll('button').forEach(button => { button.disabled = true; });
            this.status(`Adding ${course.title}…`);
            try {
                await this.call('studbud_teacher_create_class', { p_course_code: course.code, p_title: course.title, p_section: '' });
            } finally {
                this.addingCourse = false;
                box?.removeAttribute('aria-busy');
            }
            await this.loadTeacher();
            this.status(`Added ${course.title}. Students with this course are added automatically.`, 'success');
            this.app.Sfx?.play?.('success');
        }

        renderTeacherDetail() {
            const item = this.detail;
            if (!item) return this.loadTeacher();
            this.root.innerHTML = `
                <section class="teacher-hero glass-card">
                    <div>
                        <span class="eyebrow"><span class="class-code-chip">${esc(item.course_code)}</span> ${item.section ? esc(item.section) : ''}</span>
                        <h2>${esc(item.title)}</h2>
                        <p class="class-auto-note"><i class="fas fa-wand-magic-sparkles"></i> Students at ${esc(this.app.schoolShortName?.() || 'your school')} with ${esc(item.course_code)} in their courses are added automatically.</p>
                    </div>
                    <div class="teacher-hero-stats">
                        <div><strong>${(item.decks || []).length}</strong><small>shared sets</small></div>
                    </div>
                </section>
                <p id="classes-status" class="classes-status" role="status" aria-live="polite"></p>
                <div class="segmented classes-tabs" role="tablist">
                    <button type="button" role="tab" class="${this.detailTab === 'sets' ? 'selected' : ''}" aria-selected="${this.detailTab === 'sets'}" data-class-action="tab" data-tab="sets"><i class="fas fa-layer-group"></i> Flashcard sets <b class="tab-badge muted">${(item.decks || []).length}</b></button>
                    <button type="button" role="tab" class="${this.detailTab === 'settings' ? 'selected' : ''}" aria-selected="${this.detailTab === 'settings'}" data-class-action="tab" data-tab="settings"><i class="fas fa-sliders"></i> Class settings</button>
                </div>
                <div id="classes-tab-body">${this.detailTab === 'settings' ? this.settingsMarkup() : this.setsMarkup()}</div>`;
            this.app.enhanceSetPickers?.(this.root);
        }

        setsMarkup() {
            const decks = this.detail.decks || [];
            const editing = this.editingDeck;
            const cardsText = editing ? (editing.cards || []).map(card => `${card.front}\t${card.back}`).join('\n') : '';
            const editor = editing ? `<form id="teacher-deck-form" class="glass-card teacher-deck-form">
                    <h3>${editing.id ? 'Edit set' : 'New flashcard set'}</h3>
                    <label>Title<input name="title" maxlength="80" required value="${esc(editing.title || '')}" placeholder="e.g. Unit 4 vocab"></label>
                    <label>Description (optional)<input name="description" maxlength="300" value="${esc(editing.description || '')}" placeholder="What is this set for?"></label>
                    <label>Cards — one per line: <code>term⇥definition</code>, <code>term - definition</code> or <code>term: definition</code>
                        <textarea name="cards" rows="10" required placeholder="photosynthesis - how plants turn light into food">${esc(cardsText)}</textarea>
                    </label>
                    <p id="teacher-deck-preview" class="muted">${(editing.cards || []).length} cards</p>
                    <div class="actions">
                        <button class="primary-btn" type="submit"><i class="fas fa-paper-plane"></i> ${editing.id ? 'Save changes' : 'Publish to class'}</button>
                        <button class="secondary-btn" type="button" data-class-action="cancel-deck">Cancel</button>
                    </div>
                </form>` : `<button type="button" class="primary-btn" data-class-action="new-deck"><i class="fas fa-plus"></i> New flashcard set</button>`;
            const list = decks.length ? decks.map(deck => `<article class="glass-card teacher-deck-card">
                    <div><h4>${esc(deck.title)}</h4><small>${(deck.cards || []).length} cards · updated ${esc(ago(deck.updated_at))}</small>
                    ${deck.description ? `<p>${esc(deck.description)}</p>` : ''}</div>
                    <div class="actions">
                        <button type="button" class="primary-btn compact-btn" data-school-action="host-set" data-class="${esc(this.detail.id)}" data-id="${esc(deck.id)}"><i class="fas fa-tower-broadcast" aria-hidden="true"></i> Host live</button>
                        <button type="button" class="secondary-btn compact-btn" data-class-action="edit-deck" data-id="${esc(deck.id)}"><i class="fas fa-pen"></i> Edit</button>
                        <button type="button" class="secondary-btn compact-btn" data-class-action="copy-deck-local" data-id="${esc(deck.id)}"><i class="fas fa-download"></i> Copy to my sets</button>
                        <button type="button" class="danger-btn compact-btn" data-class-action="delete-deck" data-id="${esc(deck.id)}">Delete</button>
                    </div>
                </article>`).join('') : '<div class="glass-card empty-state">No sets yet. Sets you publish show up for every student in this class.</div>';
            const ownDecks = (this.app.AppState.get('flashcards') || []).filter(deck => (deck.cards || []).length >= 2);
            const fromMine = ownDecks.length && !editing ? `<label class="teacher-from-mine">Or publish one of your sets
                    <select id="teacher-publish-own" data-set-picker><option value="">Choose a set…</option>${ownDecks.map(deck => `<option value="${esc(deck.id)}">${esc(deck.title)} (${deck.cards.length})</option>`).join('')}</select></label>` : '';
            return `<div class="teacher-sets-toolbar">${editor}${fromMine}</div><div class="teacher-deck-list">${list}</div>`;
        }

        settingsMarkup() {
            const item = this.detail;
            return `<form id="teacher-class-settings" class="glass-card teacher-class-form">
                    <label>Class name<input name="title" maxlength="80" required value="${esc(item.title)}"></label>
                    <label>Period or section<input name="section" maxlength="40" value="${esc(item.section || '')}"></label>
                    <div class="actions">
                        <button class="primary-btn" type="submit">Save</button>
                        <button class="danger-btn" type="button" data-class-action="delete-class">Stop teaching this course</button>
                    </div>
                </form>`;
        }

        // ------------------------------------------------------------------ STUDENT
        courseCodes() {
            if (!this.courseSharingEnabled()) return [];
            return Array.from(new Set((this.app.AppState.get('courses') || [])
                .flatMap(course => this.codesForCourse(course))));
        }

        codesForCourse(course) {
            const normalize = text => String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const catalog = this.app.schoolCatalog?.() || [];
            const match = catalog.find(item => item.code === course.catalogCode || item.code === course.code)
                || catalog.find(item => normalize(item.title) === normalize(course.title));
            return [...new Set([match?.code, course.catalogCode, course.code].filter(Boolean).map(String)
                .flatMap(code => [code.trim(), ...code.split('/').map(part => part.trim())]).filter(Boolean))];
        }

        courseMatches(course, code) {
            const codes = this.codesForCourse(course).map(value => value.toUpperCase());
            return [code, ...String(code).split('/')].some(part => codes.includes(String(part).trim().toUpperCase()));
        }

        async loadStudent() {
            const id = ++this.requestId;
            const key = this.contextKey();
            this.loading = true;
            this.root.innerHTML = '<div class="classes-skeleton" aria-busy="true"><span></span><span></span></div>';
            try {
                await this.syncEnrollment(true);
                if (this.currentRequest(id, key) && this.studentData) this.renderStudent();
            } catch (error) {
                if (!this.currentRequest(id, key)) return;
                if (this.studentData) {
                    this.renderStudent();
                    this.status(this.app.friendlyErrorMessage(error), 'error');
                } else {
                    this.root.innerHTML = `<div class="glass-card empty-state">${esc(this.app.friendlyErrorMessage(error))}</div>`;
                }
            } finally {
                if (id === this.requestId) this.loading = false;
            }
        }

        renderStudent() {
            return this.app.schoolCommunity?.paint();
        }

        studentSetsMarkup(classes) {
            const local = this.app.AppState.get('flashcards') || [];
            const classCards = classes.map(item => {
                const decks = item.decks || [];
                return `<article class="glass-card student-class-card">
                    <header>
                        <div><span class="class-code-chip">${esc(item.course_code)}</span>${item.section ? ` <span class="class-section">${esc(item.section)}</span>` : ''}
                        <h3>${esc(item.title)}</h3>
                        <small><i class="fas fa-chalkboard-user"></i> ${esc(personName(item.teacher))} · ${Number(item.student_count || 0)} students</small></div>
                    </header>
                    ${decks.length ? `<ul class="class-deck-list">${decks.map(deck => {
                        const saved = local.find(entry => entry.classDeckId === deck.id);
                        const stale = saved && deck.updated_at && saved.classDeckUpdatedAt !== deck.updated_at;
                        return `<li>
                            <span class="class-deck-icon"><i class="fas fa-layer-group"></i></span>
                            <span><strong>${esc(deck.title)}</strong><small>${(deck.cards || []).length} cards${deck.description ? ` · ${esc(deck.description)}` : ''}${stale ? ' · <b>updated by your teacher</b>' : ''}</small></span>
                            <button type="button" class="primary-btn compact-btn" data-class-action="study-class-deck" data-class="${esc(item.id)}" data-id="${esc(deck.id)}"><i class="fas fa-play"></i> Study</button>
                            <button type="button" class="secondary-btn compact-btn" data-class-action="save-class-deck" data-class="${esc(item.id)}" data-id="${esc(deck.id)}"${saved && !stale ? ' disabled' : ''}>${saved ? (stale ? 'Update' : '<i class="fas fa-check"></i> Saved') : '<i class="fas fa-plus"></i> Save'}</button>
                        </li>`;
                    }).join('')}</ul>` : '<p class="muted">Your teacher has not posted any flashcard sets yet.</p>'}
                </article>`;
            }).join('');
            return `<section><h3>Teacher-published sets</h3><p class="settings-hint">Your grades, assignments and private study activity are not shared with teachers.</p><div class="student-class-grid">${classCards}</div></section>`;
        }

        findClassDeck(classId, deckId) {
            const source = this.isTeacher() ? [this.detail] : (this.studentData?.classes || []);
            const item = source.find(entry => entry && (!classId || entry.id === classId) && (entry.decks || []).some(deck => deck.id === deckId));
            return item ? { item, deck: item.decks.find(deck => deck.id === deckId) } : null;
        }

        async saveClassDeck(classId, deckId) {
            const found = this.findClassDeck(classId, deckId);
            if (!found) throw new Error('That set is no longer available.');
            const { item, deck } = found;
            const AppState = this.app.AppState;
            const existing = (AppState.get('flashcards') || []).find(entry => entry.classDeckId === deck.id);
            const previous = new Map((existing?.cards || []).map(card => [card.front, card]));
            const localDeck = {
                ...(existing || {}),
                id: existing?.id || `class_${deck.id}`,
                title: deck.title,
                cards: (deck.cards || []).map((card, index) => ({
                    repetitions: 0, interval: 0, easeFactor: 2.5,
                    ...(previous.get(card.front) || {}),
                    id: previous.get(card.front)?.id || `card_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
                    front: String(card.front || ''),
                    back: String(card.back || '')
                })),
                classDeckId: deck.id,
                classDeckUpdatedAt: deck.updated_at || '',
                communitySourceAuthor: personName(item.teacher),
                courseCode: existing?.courseCode || ((AppState.get('courses') || []).find(course => this.courseMatches(course, item.course_code))?.code || ''),
                courseTitle: item.title,
                studiedCount: existing?.studiedCount || 0
            };
            await AppState.saveFlashcardDeck(localDeck);
            return localDeck;
        }

        scheduleSync(delay = 4000, force = false) {
            if (this.isTeacher() || !this.available()) return;
            clearTimeout(this.syncTimer);
            this.syncTimer = setTimeout(() => this.syncEnrollment(force).catch(error => {
                console.warn('[Classes] Could not refresh class membership:', error.message);
                if (this.visible()) this.status(this.app.friendlyErrorMessage(error), 'error');
            }), delay);
        }

        async syncEnrollment(force = false) {
            if (this.isTeacher() || !this.available() || !this.courseSharingEnabled()) return;
            if (this.syncing) {
                await this.syncing;
                if (force && this.available() && !this.isTeacher()) return this.syncEnrollment(true);
                return;
            }
            if (!force && Date.now() - this.lastSync < ENROLLMENT_EVERY_MS) return;
            const key = this.contextKey();
            const request = this.requestId;
            const codes = this.courseCodes();
            const codesKey = codes.join('|');
            const current = () => this.currentRequest(request, key) && codesKey === this.courseCodes().join('|');
            this.syncing = (async () => {
                // Persist school/course changes before the teacher reconciles this enrollment against cloud data.
                if (!this.studentData || codesKey !== this.lastCodesKey) await window.StudBudCloud?.syncNow?.();
                if (!current()) return;
                const data = await this.call('studbud_my_classes', { p_course_codes: codes });
                if (!current()) return;
                this.studentData = data;
                this.lastCodesKey = codesKey;
                if (current()) this.lastSync = Date.now();
            })();
            try {
                await this.syncing;
            } finally {
                this.syncing = false;
            }
        }

        // ------------------------------------------------------------------ EVENTS
        onInput(event) {
            const target = event.target;
            if (target.id === 'teacher-course-search' && event.type === 'input') {
                this.renderCourseResults(target.value);
            } else if (target.name === 'cards' && target.closest('#teacher-deck-form')) {
                const count = parseCardLines(target.value).length;
                const preview = document.getElementById('teacher-deck-preview');
                if (preview) preview.textContent = `${count} card${count === 1 ? '' : 's'} ready${count > 500 ? ' — the limit is 500' : ''}`;
            } else if (target.id === 'teacher-publish-own' && event.type === 'change' && target.value) {
                const deck = (this.app.AppState.get('flashcards') || []).find(entry => entry.id === target.value);
                if (deck) {
                    this.editingDeck = { id: null, title: deck.title, description: '', cards: (deck.cards || []).map(card => ({ front: card.front, back: card.back })) };
                    this.renderTeacherDetail();
                }
            }
        }

        async onSubmit(event) {
            const form = event.target;
            if (!['teacher-class-form', 'teacher-deck-form', 'teacher-class-settings'].includes(form.id)) return;
            event.preventDefault();
            const button = form.querySelector('[type="submit"]');
            if (button) button.disabled = true;
            try {
                if (form.id === 'teacher-class-form') {
                    const options = this.courseOptions();
                    const first = options[this.courseIndex >= 0 ? this.courseIndex : 0];
                    if (!first) throw new Error('Search for a course, then tap it to add it.');
                    await this.addCourse(first.dataset.code);
                } else if (form.id === 'teacher-deck-form') {
                    const cards = parseCardLines(form.elements.cards.value);
                    if (cards.length < 2) throw new Error('Add at least 2 cards (one per line, term and definition).');
                    if (cards.length > 500) throw new Error('A class set can have up to 500 cards.');
                    await this.call('studbud_teacher_save_deck', {
                        p_class_id: this.detail.id, p_deck_id: this.editingDeck?.id || null,
                        p_title: form.elements.title.value.trim(), p_description: form.elements.description.value.trim(), p_cards: cards
                    });
                    this.editingDeck = null;
                    await this.openClass(this.detail.id);
                    this.status(`Published “${form.elements.title.value.trim()}” with ${cards.length} cards.`, 'success');
                } else if (form.id === 'teacher-class-settings') {
                    await this.call('studbud_teacher_update_class', { p_class_id: this.detail.id, p_title: form.elements.title.value.trim(), p_section: form.elements.section.value.trim(), p_new_code: false });
                    await this.openClass(this.detail.id);
                    this.status('Class saved.', 'success');
                }
            } catch (error) {
                this.status(this.app.friendlyErrorMessage(error), 'error');
            } finally {
                if (button && button.isConnected) button.disabled = false;
            }
        }

        async onClick(event) {
            const button = event.target.closest('[data-class-action]');
            if (!button) return;
            const action = button.dataset.classAction;
            const id = button.dataset.id;
            try {
                if (action === 'add-course') await this.addCourse(button.dataset.code);
                else if (action === 'add-my-courses') this.app.openCourseForm();
                else if (action === 'open-class') await this.openClass(id);
                else if (action === 'back') { this.detail = null; this.detailTab = 'sets'; await this.loadTeacher(); }
                else if (action === 'tab') { this.detailTab = button.dataset.tab; this.renderTeacherDetail(); }
                else if (action === 'delete-class') {
                    if (!await window.StudBudDialogs.confirm('Stop teaching this course? Its flashcard sets are deleted and students lose access.')) return;
                    await this.call('studbud_teacher_delete_class', { p_class_id: this.detail.id });
                    this.detail = null;
                    this.detailTab = 'sets';
                    if (this.app.schoolCommunity) await this.app.schoolCommunity.open(null);
                    else await this.loadTeacher();
                    this.status('Course removed.');
                } else if (action === 'new-deck') { this.editingDeck = { id: null, title: '', description: '', cards: [] }; this.renderTeacherDetail(); document.querySelector('#teacher-deck-form [name="title"]')?.focus(); }
                else if (action === 'edit-deck') { this.editingDeck = (this.detail.decks || []).find(deck => deck.id === id) || null; this.renderTeacherDetail(); }
                else if (action === 'cancel-deck') { this.editingDeck = null; this.renderTeacherDetail(); }
                else if (action === 'delete-deck') {
                    if (!await window.StudBudDialogs.confirm('Delete this set for the whole class?')) return;
                    await this.call('studbud_teacher_delete_deck', { p_deck_id: id });
                    await this.openClass(this.detail.id);
                } else if (action === 'copy-deck-local' || action === 'save-class-deck') {
                    const deck = await this.saveClassDeck(button.dataset.class, id);
                    if (!this.isTeacher()) this.renderStudent();
                    this.status(`“${deck.title}” is in your study sets.`, 'success');
                } else if (action === 'study-class-deck') {
                    const deck = await this.saveClassDeck(button.dataset.class, id);
                    this.app.Router.navigate('flashcard');
                    this.app.startStudy(deck.id);
                }
            } catch (error) {
                this.status(this.app.friendlyErrorMessage(error), 'error');
            }
        }
    }

    window.StudBudClassrooms = {
        parseCardLines,
        attach(app) {
            const instance = new Classrooms(app);
            app.classrooms = instance;
            return instance;
        }
    };
})(window);
