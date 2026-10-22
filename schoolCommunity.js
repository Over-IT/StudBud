(function (window) {
    'use strict';

    const esc = value => String(value ?? '').replace(/[&<>"']/g, char =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const stamp = value => {
        const date = new Date(value);
        return Number.isFinite(date.getTime()) ? date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
    };
    const GAME_NAMES = {
        skyline: 'Escape to Space', river: 'River Fishing', market: 'Package Delivery', miner: 'Crystal Mining',
        defense: 'Team Tower Defense', duel: 'King of the Hill', crypto: 'Crypto Trading',
        shooter: 'Arena Shooter', chess: 'Question Chess'
    };
    const SCHOOL_NAMES = { pchs: 'Central', pnhs: 'North', pshs: 'South', pwhs: 'West' };

    class SchoolCommunity {
        constructor(app) {
            this.app = app;
            this.classId = null;
            this.classTitle = '';
            this.tab = 'people';
            this.request = 0;
            this.drafts = new Map();
            this.posting = new Map();
            this.threadRequests = new Map();
            this.savingSets = new Map();
            this.liveMarkupCache = new WeakMap();
            this.context = '';
            document.addEventListener('click', event => this.onClick(event));
            document.addEventListener('submit', event => this.onSubmit(event));
            document.addEventListener('change', event => {
                if (event.target.id === 'community-class') this.open(event.target.value || null);
                if (event.target.id === 'moderation-school') this.renderModeration(this.moderationQuery, 0, event.target.value);
                this.rememberDraft(event);
            });
            document.addEventListener('input', event => this.rememberDraft(event));
            this.timer = setInterval(() => this.poll(), 30000);
            app.EventBus.on('state:restored', () => this.resetContext());
        }

        get root() { return document.getElementById('school-community-root'); }
        get api() { return window.StudBudCommunityGames; }
        call(fn, args = {}) {
            if (typeof this.api?.schoolCall !== 'function') throw new Error('The community update is not fully loaded. Reload StudBud to finish updating.');
            return this.api.schoolCall(fn, args);
        }
        available() { return Boolean(this.app.classrooms?.available()); }
        key() { return this.available() ? this.app.classrooms.contextKey() : ''; }
        resetContext() {
            const key = this.key();
            if (key === this.context) return;
            this.context = key;
            this.request++;
            this.classId = null;
            this.classTitle = '';
            this.data = null;
            this.classes = [];
            this.teacherClasses = [];
            this.teacherDetail = null;
            this.pendingLive = null;
            this.drafts.clear();
            this.posting.clear();
            this.threadRequests.clear();
            this.savingSets.clear();
            if (this.root) this.root.innerHTML = '';
        }
        current(id, key) { return this.available() && id === this.request && key === this.key(); }
        draftKey(parent) { return `${this.context}|${this.classId || 'school'}|${parent}`; }
        rememberDraft(event) {
            const form = event.target.closest?.('[data-community-compose], [data-community-share]');
            if (!form) return;
            const sharing = form.matches('[data-community-share]');
            this.drafts.set(this.draftKey(sharing ? 'share' : form.dataset.parent || ''), sharing
                ? { deck: form.elements.deck.value, note: form.elements.note.value, visibility: form.elements.visibility.value }
                : { body: form.elements.body.value, kind: form.elements.kind?.value || 'discussion' });
        }
        status(message, error = false) {
            const node = document.getElementById('school-community-status');
            if (node) { node.textContent = message; node.classList.toggle('error', error); }
        }
        async open(classId, title = '') {
            this.resetContext();
            if (classId !== this.classId) {
                this.data = null;
                this.app.classrooms.requestId++;
                this.app.classrooms.detail = null;
                this.app.classrooms.editingDeck = null;
                this.app.classrooms.detailTab = 'students';
            }
            this.classId = classId;
            this.classTitle = title;
            this.tab = classId ? 'updates' : 'people';
            if (this.app.Router.activeRoute === 'classes') await this.render();
            else this.app.Router.navigate('classes');
        }
        async render() {
            this.resetContext();
            if (!this.root) return;
            if (!this.available()) {
                this.root.innerHTML = '<div class="glass-card empty-state">Sign in, connect and choose your supported school to use Classrooms.</div>';
                return;
            }
            const id = ++this.request, key = this.key(), classId = this.classId;
            if (!this.data) this.root.innerHTML = '<p role="status">Loading classrooms…</p>';
            else this.status('Refreshing class updates…');
            try {
                // Student enrollment must be synchronized before checking access to a class board.
                const listing = await this.app.classrooms.call(this.app.classrooms.isTeacher() ? 'studbud_teacher_classes' : 'studbud_my_classes',
                    this.app.classrooms.isTeacher() ? {} : { p_course_codes: this.app.classrooms.courseCodes() });
                if (!this.current(id, key)) return;
                const courses = await this.call('studbud_course_communities');
                if (!this.current(id, key)) return;
                const data = await this.call('studbud_school_community', { p_class_id: classId });
                if (!this.current(id, key)) return;
                const teacherClasses = listing.classes || [];
                const course = [...(courses.classes || []), ...teacherClasses].find(item => item.id === classId);
                const ownedClass = this.app.classrooms.isTeacher() && classId && data.can_announce
                    ? teacherClasses.find(item => item.id === classId || course && this.app.classrooms.courseMatches(
                        { code: course.course_code }, item.course_code)) : null;
                let teacherDetail = null;
                if (ownedClass) {
                    teacherDetail = await this.app.classrooms.call('studbud_teacher_class_detail', { p_class_id: ownedClass.id });
                    if (!this.current(id, key)) return;
                }
                this.data = data;
                this.teacherClasses = teacherClasses;
                this.teacherDetail = teacherDetail;
                this.classes = [...(courses.classes || []), ...teacherClasses.filter(item =>
                    !(courses.classes || []).some(course => this.app.classrooms.courseMatches({ code: course.course_code }, item.course_code)))];
                if (this.app.classrooms.isTeacher()) this.app.classrooms.teacherData = listing;
                else this.app.classrooms.studentData = listing;
                this.classTitle = this.classes.find(item => item.id === classId)?.title || this.classTitle;
                this.paint();
                return true;
            } catch (error) {
                if (this.current(id, key)) {
                    if (this.data) this.status(`Could not refresh. ${this.app.friendlyErrorMessage(error)} Your draft is kept; try Refresh again.`, true);
                    else this.root.innerHTML = `<div class="glass-card"><p role="alert">${esc(this.app.friendlyErrorMessage(error))}</p><button type="button" class="secondary-btn" data-school-action="refresh">Try again</button></div>`;
                }
            }
        }
        paint() {
            const data = this.data;
            const tabs = this.classId ? [['updates', 'Updates'], ['people', 'Classmates'], ['sets', 'Shared sets']]
                : [['people', 'Schoolmates'], ['sets', 'Shared sets']];
            if (this.teacherDetail) tabs.push(['teacher', 'Teacher tools']);
            if (!tabs.some(([tab]) => tab === this.tab)) this.tab = this.classId ? 'updates' : 'people';
            this.root.innerHTML = `<header class="view-header"><div><h2>${esc(this.classId ? this.classTitle || 'Classroom' : `${this.app.schoolShortName?.() || 'School'} classrooms`)}</h2>
                <p>${this.classId ? 'Announcements, study questions and live games.' : 'Find opted-in schoolmates and publicly shared study sets.'}</p></div>
                <button type="button" class="secondary-btn" data-school-action="refresh">Refresh</button></header>
                <div class="community-toolbar"><label for="community-class">Classroom<select id="community-class"><option value="">All classrooms &amp; school</option>${this.classId && !(this.classes || []).some(item => item.id === this.classId) ? `<option value="${esc(this.classId)}" selected>Review: ${esc(this.classTitle || 'Classroom')}</option>` : ''}${(this.classes || []).map(item =>
                    `<option value="${esc(item.id)}"${item.id === this.classId ? ' selected' : ''}>${esc(item.title)}${item.section ? ` · ${esc(item.section)}` : ''}</option>`).join('')}</select></label>
                <button type="button" class="text-btn" data-target="friends-view">Manage buds &amp; requests</button>
                ${this.classId ? '<button type="button" class="text-btn" data-school-action="open-class" data-class="">All classrooms</button>' : ''}</div>
                <p id="school-community-status" role="status" aria-live="polite"></p>
                ${this.classId && data.can_moderate ? `<div class="community-review-banner"><p><i class="fas fa-shield-halved" aria-hidden="true"></i> Moderation access · ${esc(SCHOOL_NAMES[data.school] || data.school)} · Shared content only; no private grades.${data.can_post === false ? ' Review only: you are not a member of this course.' : ''}</p><button type="button" class="text-btn" data-target="admin-view">Back to class search</button></div>` : ''}
                ${!this.classId ? this.courseListMarkup() : ''}
                ${this.classId && data.course_community ? `<p class="settings-hint">This classroom is for students taking this course at this school, with or without a teacher.</p>
                    ${(data.teacher_classes || []).length ? `<p class="settings-hint">Teachers: ${data.teacher_classes.map(item => `@${esc(item.teacher)}`).join(', ')}. Teacher announcements, class sets and live games are available here.</p>` : ''}` : ''}
                <div id="community-live">${this.liveMarkup(data.live || [], this.classId, data.can_announce)}</div>
                <nav class="community-tabs" aria-label="Classroom sections">${tabs.map(([tab, label]) =>
                    `<button type="button" class="secondary-btn${this.tab === tab ? ' selected' : ''}" data-school-action="tab" data-tab="${tab}"${this.tab === tab ? ' aria-current="page"' : ''}>${label}</button>`).join('')}</nav>
                <div id="community-content">${this.tab === 'teacher' ? '<div id="classes-root" class="classes-root"></div>'
                    : this.tab === 'updates' ? this.updatesMarkup() : this.tab === 'sets' ? this.setsMarkup() : this.peopleMarkup()}</div>
                ${!this.classId && this.app.classrooms.isTeacher() ? '<details class="glass-card"><summary>Add a course you teach</summary><div id="classes-root" class="classes-root"></div></details>' : ''}
                ${this.tab !== 'teacher' && (this.classId || !this.app.classrooms.isTeacher()) ? '<p id="classes-status" class="classes-status" role="status" aria-live="polite"></p>' : ''}`;
            if (this.app.classrooms.isTeacher()) {
                this.app.classrooms.detail = this.teacherDetail;
                if (this.tab === 'teacher') this.app.classrooms.renderTeacherDetail();
                else if (!this.classId) this.app.classrooms.renderTeacherHome();
            }
            const live = document.getElementById('community-live');
            if (live) this.liveMarkupCache.set(live, this.liveMarkup(data.live || [], this.classId, data.can_announce));
        }
        courseListMarkup() {
            const courses = this.classes || [];
            return `<section class="community-course-list"><h3>My classrooms</h3><p class="settings-hint">Your school + courses. No teacher or join code needed. Teachers add announcements, class sets, live games and private progress tools.</p>
                ${courses.length ? `<div class="community-set-grid">${courses.map(item => `<article class="glass-card"><span class="eyebrow">${esc(item.course_code)}</span><h4>${esc(item.title)}</h4>
                    <button type="button" class="secondary-btn" data-school-action="open-class" data-class="${esc(item.id)}" data-title="${esc(item.title)}">Open classroom</button></article>`).join('')}</div>`
                    : '<p>Add your courses in My grades and sync your account to find their classrooms.</p><button type="button" class="text-btn" data-target="gpa-view">Manage my courses</button>'}</section>`;
        }
        liveMarkup(rooms, classId, teacher = false) {
            if (!rooms.length) return classId ? '<p class="settings-hint">No class game is live right now. Your teacher can host from a class set.</p>' : '';
            return rooms.map(room => `<article class="glass-card community-live-card"><div><span class="eyebrow">Live class game · ${esc(room.status === 'waiting' ? 'Lobby open' : 'In progress')}</span>
                <h3>${esc(room.deck_title)}</h3><p>${esc(room.teacher_username)} · ${esc(GAME_NAMES[room.mode] || room.mode)} · Code <strong>${esc(room.room_code)}</strong></p></div>
                <div class="actions"><button type="button" class="primary-btn" data-school-action="join" data-code="${esc(room.room_code)}"${room.joinable === false ? ' disabled' : ''}>${room.joinable === false ? 'Joining closed' : 'Join game'}</button>
                ${teacher && room.can_manage !== false ? `<button type="button" class="text-btn" data-school-action="unlist" data-class="${esc(room.class_id || classId)}">Remove listing</button>` : ''}</div></article>`).join('');
        }
        peopleMarkup() {
            const opted = this.classId ? this.data.class_discovery : this.data.school_discovery;
            return `<section class="glass-card"><h3>${this.classId ? 'People sharing this class' : 'Meet schoolmates'}</h3>
                <p class="settings-hint">${this.classId ? 'Only students who enable course discovery appear. Teachers, periods and enrollment may differ.' : 'School discovery is off by default. Turning it on shares only your username and school with other opted-in schoolmates, not your grades, real name or schedule.'}</p>
                ${this.classId ? `<button type="button" class="text-btn" data-action="edit-public-profile">Manage course discovery privacy</button>` :
                    `<button type="button" class="secondary-btn" data-school-action="discovery" data-enabled="${!opted}">${opted ? 'Turn off school discovery' : 'Turn on school discovery'}</button>`}
                ${!opted ? '<p>Discovery is off. Enable it to find others and let them find you.</p>' : `<ul class="community-people">${(this.data.people || []).map(person =>
                    `<li><button type="button" class="text-btn" data-action="view-profile" data-id="${esc(person.user_id)}">@${esc(person.username)}</button><button type="button" class="secondary-btn compact-btn" data-school-action="add-bud" data-name="${esc(person.username)}">Add bud</button></li>`).join('') || '<li>No opted-in schoolmates yet. Invite a friend to turn discovery on.</li>'}</ul>`}</section>`;
        }
        setsMarkup() {
            const course = (this.classes || []).find(item => item.id === this.classId);
            const listing = this.app.classrooms.isTeacher() ? this.teacherClasses : this.app.classrooms.studentData?.classes || this.teacherClasses;
            const teacherSets = this.teacherDetail ? [this.teacherDetail] : (listing || []).filter(item =>
                course && this.app.classrooms.courseMatches({ code: course.course_code }, item.course_code));
            return `${teacherSets.length ? this.app.classrooms.studentSetsMarkup(teacherSets) : ''}${this.classSetsMarkup()}<section><header class="view-header"><div><h3>Public study sets ${this.classId ? 'for this course' : 'from your school'}</h3><p>Teacher-published and student-shared sets are available together here.</p></div>
                <button type="button" class="secondary-btn" data-target="study-manage-view">Manage &amp; share your sets</button></header>
                <p class="settings-hint">Authors must also share their school publicly, or both of you must enable school discovery, to appear in school-scoped lists.</p>
                <div class="community-set-grid">${(this.data.decks || []).map(deck => `<article class="glass-card"><h4>${esc(deck.title)}</h4>
                    <p>${esc(deck.author)} · ${Number(deck.card_count) || 0} cards${deck.course_title ? ` · ${esc(deck.course_title)}` : ''}</p>
                    <button type="button" class="primary-btn" data-school-action="save-set" data-id="${esc(deck.id)}">Add to my sets</button>
                    <button type="button" class="text-btn" data-action="report-content" data-report-type="deck" data-id="${esc(deck.id)}" data-name="${esc(deck.title)}">Report</button></article>`).join('') || '<div class="glass-card empty-state">No public sets here yet. Share a set from Manage sets when you are ready.</div>'}</div></section>`;
        }
        classSetsMarkup() {
            const local = this.app.AppState?.get('flashcards') || [];
            const user = window.StudBudCloud?.user?.id;
            const own = local.filter(deck => (!deck.communitySourceOwnerId || deck.communitySourceOwnerId === user)
                && (!deck.classShareSourceOwnerId || deck.classShareSourceOwnerId === user));
            const draft = this.drafts.get(this.draftKey('share')) || {};
            const pending = this.posting.has(this.draftKey('share'));
            const disabled = pending ? ' disabled' : '';
            return `<section class="community-shared-section"><h3>${this.classId ? 'Class study sets' : 'Sets shared with your school'}</h3>
                <p class="settings-hint">Latest 100 shares. Each includes a purpose note and its audience. Public sets are discoverable by anyone; course-only and school-only sets stay in their chosen community.</p>
                ${this.classId && this.data.can_post !== false ? `<details class="glass-card community-new-post"${draft.note || pending ? ' open' : ''}><summary>Share a set <i class="fas fa-plus" aria-hidden="true"></i></summary>
                    ${own.length ? `<form data-community-share class="community-compose"><label>Your set<select name="deck" required${disabled}>${own.map(deck => `<option value="${esc(deck.id)}"${draft.deck === deck.id ? ' selected' : ''}>${esc(deck.title)}</option>`).join('')}</select></label>
                    <label>What is it for?<textarea name="note" rows="2" required maxlength="300"${disabled} placeholder="For example: Unit 3 vocabulary for Friday's quiz">${esc(draft.note || '')}</textarea></label>
                    <label>Who can view it?<select name="visibility"${disabled}>${[['public', 'Public · anyone can discover it (default)'], ['course', 'This course at this school only'], ['school', 'Everyone at this school']].map(([value, label]) => `<option value="${value}"${(draft.visibility || 'public') === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
                    <p class="settings-hint">The course/school association is shared with your chosen audience. Only terms, answers and distractors are copied, not study history, images, attachments or private assessment links. To restrict a set that already has a public copy, unpublish it in Manage sets first.</p>
                    <button type="submit" class="primary-btn"${disabled}>${pending ? 'Sharing…' : 'Share set'}</button></form>` : '<p>Create your own set in Study first. Copies of someone else’s set cannot be reposted.</p>'}</details>` : ''}
                <div class="community-set-grid">${(this.data.class_sets || []).map(set => `<article class="glass-card community-shared-set">
                    <span class="deck-chip">${esc(({ public: 'Public', school: 'School only', course: 'Course only' })[set.visibility] || set.visibility)}</span>
                    <h4>${esc(set.title)}</h4><p class="community-body">${esc(set.note)}</p><small>${Number(set.card_count) || 0} cards · @${esc(set.author)}${!this.classId ? ` · ${esc(set.course_title)}` : ''}</small>
                    <div class="actions"><button type="button" class="secondary-btn" data-school-action="preview-set" data-id="${esc(set.id)}">View cards</button>
                    <button type="button" class="text-btn" data-school-action="report-share" data-id="${esc(set.id)}">Report</button>
                    ${set.owner_id === user || this.data.can_announce || this.data.can_moderate ? `<button type="button" class="text-btn" data-school-action="remove-share" data-id="${esc(set.id)}">Remove share</button>` : ''}</div></article>`).join('') || '<p class="glass-card empty-state">No sets shared here yet.</p>'}</div></section>`;
        }
        async onShare(event) {
            event.preventDefault();
            const form = event.target, key = this.key(), id = this.request, classId = this.classId, draftKey = this.draftKey('share');
            if (this.posting.has(draftKey)) return;
            const operation = {};
            this.posting.set(draftKey, operation);
            this.drafts.set(draftKey, { deck: form.elements.deck.value, note: form.elements.note.value, visibility: form.elements.visibility.value });
            const controls = [...form.elements];
            controls.forEach(control => { control.disabled = true; });
            let shared = false;
            try {
                if (!classId || this.data.can_post === false) throw new Error('Only course members can share a set here.');
                const deck = (this.app.AppState.get('flashcards') || []).find(item => item.id === form.elements.deck.value);
                if (!deck) throw new Error('Choose one of your saved sets.');
                const row = this.api.sharedDeckRow(deck);
                const result = await this.call('studbud_share_class_set', { p_class_id: classId, p_source_deck_id: row.source_deck_id,
                    p_title: row.title, p_cards: row.cards, p_note: form.elements.note.value.trim(), p_visibility: form.elements.visibility.value });
                shared = true;
                if (key !== this.key()) return;
                this.drafts.delete(draftKey);
                if (result.public_deck_id) await this.app.updateSavedDeck(deck.id, { communityPublished: true, communityDeckId: result.public_deck_id });
                if (!this.current(id, key)) return;
                if (await this.render()) this.status(`Set shared ${form.elements.visibility.value === 'public' ? 'publicly and added to this class' : form.elements.visibility.value === 'school' ? 'with this school only' : 'with this course at this school only'}.`);
            } catch (error) {
                if (key === this.key() && classId === this.classId) this.status(`${shared ? 'The set was shared, but the display could not update. Refresh before retrying. ' : ''}${this.app.friendlyErrorMessage(error)}`, true);
            } finally {
                if (this.posting.get(draftKey) === operation) {
                    this.posting.delete(draftKey);
                    controls.forEach(control => { control.disabled = false; });
                    if (key === this.key() && classId === this.classId) {
                        document.querySelectorAll('[data-community-share]').forEach(current => {
                            [...current.elements].forEach(control => { control.disabled = false; });
                            current.elements.note.value = this.drafts.get(draftKey)?.note || '';
                            current.querySelector('[type="submit"]').textContent = 'Share set';
                        });
                    }
                }
            }
        }
        async saveSharedSet(setId) {
            if (this.savingSets.has(setId)) return this.savingSets.get(setId);
            const job = this.saveSharedSetCopy(setId);
            this.savingSets.set(setId, job);
            try { return await job; } finally { if (this.savingSets.get(setId) === job) this.savingSets.delete(setId); }
        }
        async saveSharedSetCopy(setId) {
            const key = this.key();
            const set = await this.call('studbud_get_class_shared_set', { p_set_id: setId });
            if (key !== this.key()) return;
            if (!set.can_save) throw new Error('This set is available for moderation review only.');
            const state = this.app.AppState;
            const existing = (state.get('flashcards') || []).find(deck => deck.classShareSourceId === set.id);
            if (existing) {
                this.status('You already have a personal copy. View it in Study; your saved progress is unchanged.');
                return existing;
            }
            const course = (state.get('courses') || []).find(item => this.app.classrooms.courseMatches(item, set.course_code));
            const deck = { id: `class_shared_${set.id}`, title: set.title,
                cards: set.cards.map(card => ({ id: `card_${window.crypto.randomUUID()}`, front: card.front, back: card.back,
                    repetitions: 0, interval: 0, easeFactor: 2.5 })),
                classShareSourceId: set.id, classShareSourceOwnerId: set.owner_id, communitySourceAuthor: set.author,
                courseCode: course?.code || '', courseTitle: set.course_title, studiedCount: 0 };
            await state.saveFlashcardDeck(deck);
            this.status('Added a personal copy to Study. Future changes to the shared set do not overwrite your copy or progress.');
            return deck;
        }
        async renderModeration(query = '', offset = 0, school = this.moderationSchool || '') {
            if (!this.app.canModerateFlashcards) throw new Error('Moderator access is required.');
            const list = document.getElementById('admin-list'), status = document.getElementById('admin-status');
            if (!list || !status) return;
            const token = this.moderationRequest = (this.moderationRequest || 0) + 1, key = this.key();
            this.moderationQuery = query;
            this.moderationSchool = school;
            status.textContent = 'Loading class communities…';
            try {
                const data = await this.api.adminCall('studbud_admin_search_classes', { p_query: query, p_school: school, p_offset: offset });
                if (token !== this.moderationRequest || key !== this.key() || !this.app.canModerateFlashcards
                    || this.app.Router.activeRoute !== 'admin' || this.app.adminTab !== 'classes') return;
                const schools = data.all_schools ? Object.keys(SCHOOL_NAMES) : [...new Set([data.own_school, ...(data.extra_schools || [])])];
                const rows = (data.classes || []).slice(0, 20);
                status.textContent = `${rows.length} communities on this page. ${data.all_schools ? 'Administrator: all schools.' : 'Moderators: your school and any additional schools explicitly granted by an administrator.'} Review shared content only; no private grades or teacher rosters are exposed.`;
                list.innerHTML = `<label class="community-moderation-filter">School<select id="moderation-school"><option value="">All permitted schools</option>${schools.map(value => `<option value="${esc(value)}"${value === school ? ' selected' : ''}>${esc(SCHOOL_NAMES[value] || value)}</option>`).join('')}</select></label>
                    <div class="community-set-grid">${rows.map(item => `<article class="glass-card"><span class="eyebrow">${esc(SCHOOL_NAMES[item.school] || item.school)} · ${esc(item.course_code)} · ${item.community ? 'Course community' : 'Teacher classroom'}</span>
                        <h3>${esc(item.title)}${item.section ? ` · ${esc(item.section)}` : ''}</h3><p>${Number(item.post_count) || 0} posts · ${Number(item.set_count) || 0} shared sets</p>
                        <button type="button" class="secondary-btn" data-school-action="open-class" data-class="${esc(item.id)}" data-title="${esc(item.title)}">Review community</button></article>`).join('') || '<p>No matching communities in your permitted schools.</p>'}</div>
                    <div class="actions">${offset ? `<button type="button" class="secondary-btn" data-school-action="moderation-page" data-offset="${Math.max(0, offset - 20)}">Previous</button>` : ''}${(data.classes || []).length > 20 ? `<button type="button" class="secondary-btn" data-school-action="moderation-page" data-offset="${offset + 20}">Next</button>` : ''}</div>
                    ${this.app.isAdmin ? `<details class="glass-card community-new-post"><summary>Additional moderator school access</summary><p class="settings-hint">Moderators always have access to their own school. Grant or revoke additional schools below; administrators already have access to every school.</p>
                        <form data-community-scope class="community-compose"><label>Moderator username<input name="username" required maxlength="80" autocomplete="off"></label>
                        <label>School<select name="school">${Object.entries(SCHOOL_NAMES).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
                        <label>Permission<select name="allowed"><option value="true">Grant additional access</option><option value="false">Revoke additional access</option></select></label><button type="submit" class="primary-btn">Apply permission</button></form>
                        <ul>${(data.scope_grants || []).map(grant => `<li>@${esc(grant.username)} · ${esc(SCHOOL_NAMES[grant.school] || grant.school)}</li>`).join('') || '<li>No additional school grants.</li>'}</ul></details>` : ''}`;
                return true;
            } catch (error) {
                if (token === this.moderationRequest && key === this.key()) status.textContent = `Could not load class communities. ${this.app.friendlyErrorMessage(error)}`;
            }
        }
        async onScopeSubmit(event) {
            event.preventDefault();
            const form = event.target, button = form.querySelector('[type="submit"]'), key = this.key();
            if (button.disabled) return;
            button.disabled = true;
            const status = document.getElementById('admin-status');
            try {
                if (!this.app.isAdmin) throw new Error('Only administrators can change moderator school access.');
                await this.api.adminCall('studbud_admin_set_community_scope', { p_username: form.elements.username.value.trim(),
                    p_school: form.elements.school.value, p_allowed: form.elements.allowed.value === 'true' });
                if (key !== this.key()) return;
                if (await this.renderModeration(this.moderationQuery)) status.textContent = `Moderator school permission ${form.elements.allowed.value === 'true' ? 'granted' : 'revoked'}. Own-school access is unchanged.`;
            } catch (error) {
                if (key === this.key()) status.textContent = this.app.friendlyErrorMessage(error);
            } finally { if (button.isConnected) button.disabled = false; }
        }
        composeMarkup(parent = '') {
            if (this.data.can_post === false) return '';
            const draft = this.drafts.get(this.draftKey(parent));
            const pending = this.posting.has(this.draftKey(parent));
            return `<form data-community-compose data-parent="${esc(parent)}" class="community-compose">
                ${!parent && this.data.can_announce ? `<label>Post type<select name="kind"${pending ? ' disabled' : ''}><option value="discussion">Discussion</option><option value="announcement"${draft?.kind === 'announcement' ? ' selected' : ''}>Teacher announcement</option></select></label>` : ''}
                <label>${parent ? 'Your reply' : 'Ask a study question or share an update'}<textarea name="body" rows="${parent ? 2 : 3}" required maxlength="2000"${pending ? ' disabled' : ''} placeholder="Keep it helpful. Do not post private information or test answers.">${esc(draft?.body || '')}</textarea></label>
                <button type="submit" class="primary-btn"${pending ? ' disabled' : ''}>${pending ? 'Posting…' : parent ? 'Reply' : 'Post to class'}</button></form>`;
        }
        updatesMarkup() {
            return `<section class="community-update-header"><h3>Class updates</h3><p class="settings-hint">Shared with this class. Keep private information out of posts. Course membership is self-reported.</p>
                ${this.data.can_post === false ? '' : `<details class="glass-card community-new-post"${this.drafts.get(this.draftKey(''))?.body ? ' open' : ''}><summary>Write a post <i class="fas fa-plus" aria-hidden="true"></i></summary>${this.composeMarkup()}</details>`}</section>
                <div id="community-posts" class="community-posts">${(this.data.posts || []).map(post => this.postMarkup(post)).join('') || '<p class="glass-card empty-state">No updates yet. Start with a study question.</p>'}</div>
                ${this.moreMarkup(this.data.next_before, 'posts')}`;
        }
        moreMarkup(cursor, type, parent = '') {
            return cursor ? `<button type="button" class="secondary-btn community-more" data-school-action="more-${type}" data-before="${esc(cursor)}" data-parent="${esc(parent)}">Load older ${type === 'posts' ? 'updates' : 'replies'}</button>` : '';
        }
        postMarkup(post, reply = false) {
            const own = post.author_id === window.StudBudCloud?.user?.id;
            return `<article class="glass-card community-post${reply ? ' community-reply' : ''}${post.kind === 'announcement' ? ' community-announcement' : ''}" data-post="${esc(post.id)}">
                <header><strong>${post.kind === 'announcement' ? 'Teacher announcement · ' : ''}@${esc(post.username)}</strong><time datetime="${esc(post.created_at)}">${esc(stamp(post.created_at))}</time></header>
                <p class="community-body">${esc(post.body)}</p><div class="actions">
                ${!reply ? `<button type="button" class="text-btn" data-school-action="replies" data-id="${esc(post.id)}" aria-expanded="false" aria-controls="community-thread-${esc(post.id)}">${Number(post.reply_count) || 0} replies · Open discussion</button>` : ''}
                <button type="button" class="text-btn" data-school-action="report" data-id="${esc(post.id)}">Report</button>
                ${own || this.data.can_announce || this.data.can_moderate ? `<button type="button" class="text-btn" data-school-action="delete" data-id="${esc(post.id)}">Delete</button>` : ''}</div>
                ${!reply ? `<div id="community-thread-${esc(post.id)}" class="community-thread" hidden></div>` : ''}</article>`;
        }
        updateLive(node, markup) {
            if (!node || this.liveMarkupCache.get(node) === markup) return;
            if (node.innerHTML !== markup) node.innerHTML = markup;
            this.liveMarkupCache.set(node, markup);
        }
        async poll() {
            if (document.hidden || !this.available() || this.polling) return;
            if (this.app.Router.activeRoute !== 'classes' || !this.data || !this.classId) return;
            this.polling = true;
            const id = this.request, key = this.key(), classId = this.classId;
            try {
                const data = await this.call('studbud_school_community', { p_class_id: classId });
                if (!this.current(id, key) || this.app.Router.activeRoute !== 'classes') return;
                this.data.live = data.live;
                const live = document.getElementById('community-live');
                this.updateLive(live, this.liveMarkup(data.live || [], classId, data.can_announce));
                if ((data.posts || [])[0]?.id !== (this.data.posts || [])[0]?.id) this.status('Class updates changed. Refresh to see the latest; your draft is kept.');
            } catch (error) {
                if (this.current(id, key)) this.status(this.app.friendlyErrorMessage(error), true);
            } finally { this.polling = false; }
        }
        async refreshClassListings() {
            if (!this.available() || this.classListingsBusy) return;
            this.classListingsBusy = true;
            const key = this.key();
            try {
                await Promise.all([...document.querySelectorAll('[data-school-live]')].map(async node => {
                    try {
                        const data = await this.call('studbud_school_community', { p_class_id: node.dataset.schoolLive });
                        if (key !== this.key() || !node.isConnected) return;
                        this.updateLive(node, this.liveMarkup(data.live || [], node.dataset.schoolLive, data.can_announce));
                    } catch (error) {
                        if (key === this.key() && node.isConnected) {
                            this.liveMarkupCache.delete(node);
                            node.textContent = this.app.friendlyErrorMessage(error);
                        }
                    }
                }));
            } finally { this.classListingsBusy = false; }
        }
        async onSubmit(event) {
            const form = event.target;
            if (form.matches?.('[data-community-share]')) return this.onShare(event);
            if (form.matches?.('[data-community-scope]')) return this.onScopeSubmit(event);
            if (!form.matches?.('[data-community-compose]')) return;
            event.preventDefault();
            const button = form.querySelector('[type="submit"]');
            const id = this.request, key = this.key(), parent = form.dataset.parent || '';
            const classId = this.classId, draftKey = this.draftKey(parent);
            if (this.posting.has(draftKey)) return;
            this.drafts.set(draftKey, { body: form.elements.body.value, kind: form.elements.kind?.value || 'discussion' });
            const operation = {};
            this.posting.set(draftKey, operation);
            button.disabled = true;
            form.elements.body.disabled = true;
            if (form.elements.kind) form.elements.kind.disabled = true;
            let posted = false;
            try {
                if (!classId) throw new Error('Choose a class before posting.');
                if (!form.elements.body.value.trim()) throw new Error('Write a message before posting.');
                await this.call('studbud_community_post', { p_class_id: classId, p_body: form.elements.body.value.trim(),
                    p_kind: form.elements.kind?.value || 'discussion', p_parent_id: parent || null });
                posted = true;
                if (key !== this.key()) return;
                this.drafts.delete(draftKey);
                if (parent) {
                    const post = this.data?.posts?.find(item => item.id === parent);
                    if (post) post.reply_count = (Number(post.reply_count) || 0) + 1;
                }
                if (!this.current(id, key)) return;
                if (parent) await this.loadReplies(parent);
                else if (!await this.render()) return;
                this.status('Posted to your class.');
            } catch (error) {
                if (this.current(id, key)) this.status(`${posted ? 'Your post was saved, but replies could not refresh. ' : ''}${this.app.friendlyErrorMessage(error)}`, true);
            } finally {
                const ownsOperation = this.posting.get(draftKey) === operation;
                if (ownsOperation) this.posting.delete(draftKey);
                if (button.isConnected) {
                    button.disabled = false;
                    form.elements.body.disabled = false;
                    if (posted) form.elements.body.value = '';
                    if (form.elements.kind) form.elements.kind.disabled = false;
                }
                if (ownsOperation && key === this.key() && classId === this.classId) {
                    document.querySelectorAll('[data-community-compose]').forEach(current => {
                        if ((current.dataset.parent || '') !== parent) return;
                        current.elements.body.disabled = false;
                        current.elements.body.value = this.drafts.get(draftKey)?.body || '';
                        if (current.elements.kind) current.elements.kind.disabled = false;
                        const submit = current.querySelector('[type="submit"]');
                        submit.disabled = false;
                        submit.textContent = parent ? 'Reply' : 'Post to class';
                    });
                }
            }
        }
        async loadReplies(postId, before = null) {
            const id = this.request, key = this.key();
            const thread = document.getElementById(`community-thread-${postId}`);
            if (!thread || thread.hidden) return;
            if (before && this.threadRequests.has(postId)) return;
            const token = {};
            this.threadRequests.set(postId, token);
            if (!before) thread.innerHTML = '<p role="status">Loading replies…</p>';
            thread.setAttribute('aria-busy', 'true');
            const current = () => this.current(id, key) && this.threadRequests.get(postId) === token
                && document.getElementById(`community-thread-${postId}`) === thread && !thread.hidden;
            try {
                const data = await this.call('studbud_community_replies', { p_post_id: postId, p_before: before });
                if (!current()) return;
                const rows = (data.posts || []).map(post => this.postMarkup(post, true)).join('');
                if (before) {
                    thread.querySelector('.community-more')?.remove();
                    thread.querySelector('.community-replies').insertAdjacentHTML('beforeend', rows);
                    thread.querySelector('.community-replies').insertAdjacentHTML('afterend', this.moreMarkup(data.next_before, 'replies', postId));
                } else thread.innerHTML = `<div class="community-replies">${rows || '<p>No replies yet. Start the discussion below.</p>'}</div>${this.moreMarkup(data.next_before, 'replies', postId)}${this.composeMarkup(postId)}`;
            } catch (error) {
                if (!current()) return;
                if (!before) thread.innerHTML = `<p role="alert">${esc(this.app.friendlyErrorMessage(error))} Close and reopen this discussion to retry.</p>${this.composeMarkup(postId)}`;
                throw error;
            } finally {
                if (this.threadRequests.get(postId) === token) {
                    this.threadRequests.delete(postId);
                    thread.setAttribute('aria-busy', 'false');
                }
            }
        }
        async onClick(event) {
            const button = event.target.closest('[data-school-action]');
            if (!button || button.disabled) return;
            const action = button.dataset.schoolAction;
            if (action !== 'replies') button.disabled = true;
            const id = this.request, key = this.key();
            try {
                if (action === 'open-class') await this.open(button.dataset.class || null, button.dataset.title);
                else if (action === 'refresh') await this.render();
                else if (action === 'moderation-page') await this.renderModeration(this.moderationQuery, Number(button.dataset.offset));
                else if (action === 'tab') {
                    this.tab = button.dataset.tab;
                    this.paint();
                    document.querySelector(`[data-school-action="tab"][data-tab="${this.tab}"]`)?.focus();
                }
                else if (action === 'host-set') await this.hostDialog(button.dataset.class, button.dataset.id);
                else if (action === 'join') {
                    if (this.app.hostedGameRoom) {
                        if (this.app.hostedGameRoom.room_code !== button.dataset.code) throw new Error('Leave your current game before joining this class game.');
                    } else {
                        const room = await this.api.joinRoom(button.dataset.code, this.app.gameNickname());
                        if (key !== this.key()) return;
                        this.app.openHostedGame(room);
                    }
                    this.app.Router.navigate('multiplayer');
                } else if (action === 'discovery') {
                    await this.call('studbud_set_school_discovery', { p_enabled: button.dataset.enabled === 'true' });
                    if (this.current(id, key)) await this.render();
                } else if (action === 'add-bud') {
                    const result = await this.api.friendCall('studbud_friend_request', { p_username: button.dataset.name });
                    if (this.current(id, key)) this.status(result?.status === 'accepted' ? 'You are now buds.' : `Bud request sent to @${button.dataset.name}.`);
                } else if (action === 'save-set') {
                    await this.app.importCommunityDeck(button.dataset.id);
                    if (this.current(id, key)) this.status('This set is in your library. Open Study to practice.');
                } else if (action === 'preview-set') {
                    const set = await this.call('studbud_get_class_shared_set', { p_set_id: button.dataset.id });
                    if (this.current(id, key)) this.app.openCardBrowser(set.id, 'all', set);
                } else if (action === 'remove-share') {
                    if (!await window.StudBudDialogs.confirm('Remove this share from the class? Any separately published public copy remains in the public library; moderate that separately if needed.')) return;
                    if (!this.current(id, key)) return;
                    await this.call('studbud_remove_class_shared_set', { p_set_id: button.dataset.id });
                    if (this.current(id, key)) await this.render();
                } else if (action === 'report-share') {
                    const set = this.data.class_sets?.find(item => item.id === button.dataset.id);
                    if (!set) throw new Error('Refresh to find this shared set.');
                    this.app.openReportDialog('other', '', '', button);
                    const form = document.querySelector('#report-overlay form');
                    form.elements.subject.value = `Class shared set ${set.id}`;
                    form.elements.details.value = `Class: ${set.class_id}\nSet: ${set.id}\nTitle: ${set.title}\nPurpose: ${set.note}\n\nWhat happened: `;
                } else if (action === 'replies') {
                    const thread = document.getElementById(`community-thread-${button.dataset.id}`);
                    if (!thread) return;
                    thread.hidden = !thread.hidden;
                    button.setAttribute('aria-expanded', String(!thread.hidden));
                    const post = this.data.posts?.find(item => item.id === button.dataset.id);
                    button.textContent = thread.hidden ? `${Number(post?.reply_count) || 0} replies · Open discussion` : 'Hide discussion';
                    if (thread.hidden) this.threadRequests.delete(button.dataset.id);
                    else await this.loadReplies(button.dataset.id);
                }
                else if (action === 'more-replies') await this.loadReplies(button.dataset.parent, button.dataset.before);
                else if (action === 'more-posts') {
                    const data = await this.call('studbud_school_community', { p_class_id: this.classId, p_before: button.dataset.before });
                    if (!this.current(id, key)) return;
                    const seen = new Set((this.data.posts || []).map(post => post.id));
                    const posts = (data.posts || []).filter(post => !seen.has(post.id));
                    this.data.posts = [...(this.data.posts || []), ...posts];
                    this.data.next_before = data.next_before;
                    if (!button.isConnected) return;
                    document.getElementById('community-posts').insertAdjacentHTML('beforeend', posts.map(post => this.postMarkup(post)).join(''));
                    button.insertAdjacentHTML('afterend', this.moreMarkup(data.next_before, 'posts'));
                    button.remove();
                } else if (action === 'delete') {
                    if (!await window.StudBudDialogs.confirm('Delete this post? A discussion and its replies will no longer appear to the class.')) return;
                    if (!this.current(id, key)) return;
                    await this.call('studbud_community_delete_post', { p_post_id: button.dataset.id });
                    if (this.current(id, key)) await this.render();
                } else if (action === 'report') {
                    this.app.openReportDialog('other', '', '', button);
                    const form = document.querySelector('#report-overlay form');
                    form.elements.category.value = 'other';
                    form.elements.subject.value = `Class discussion ${button.dataset.id}`;
                    const body = button.closest('[data-post]')?.querySelector('.community-body')?.textContent || '';
                    form.elements.details.value = `Class: ${this.classId}\nPost: ${button.dataset.id}\nQuoted content: ${body.slice(0, 1300)}\n\nWhat happened: `;
                } else if (action === 'unlist') {
                    await this.call('studbud_class_live_game', { p_class_id: button.dataset.class, p_code: null });
                    if (this.app.Router.activeRoute === 'classes' && this.current(id, key)) await this.render();
                    else await this.refreshClassListings();
                }
            } catch (error) {
                if (key !== this.key() || (action !== 'open-class' && action !== 'refresh' && id !== this.request)) return;
                const message = this.app.friendlyErrorMessage(error);
                if (this.app.Router.activeRoute === 'classes') this.status(message, true);
                else this.app.classrooms.status(message, 'error');
            } finally { if (button.isConnected) button.disabled = false; }
        }
        async hostDialog(classId, deckId) {
            if (!this.available() || !this.app.classrooms.isTeacher()) throw new Error('Sign in with the class teacher account to host.');
            const found = this.app.classrooms.findClassDeck(classId, deckId);
            if (!found) throw new Error('That class set is no longer available. Refresh the class.');
            if (document.getElementById('class-host-dialog')) return;
            const dialog = document.createElement('dialog');
            dialog.id = 'class-host-dialog';
            dialog.className = 'app-confirmation';
            dialog.setAttribute('aria-labelledby', 'class-host-title');
            const modes = Object.entries(GAME_NAMES);
            dialog.innerHTML = `<form><h2 id="class-host-title">Host ${esc(found.deck.title)}</h2><p>Students see a Join button on this class page while the room is open. Rooms use the normal game rules and code access.</p>
                <label>Game<select name="mode">${modes.map(([mode, title]) => `<option value="${mode}">${title}</option>`).join('')}</select></label>
                <label>Length in minutes (Defense and Chess end by their game rules)<input type="number" name="minutes" min="1" max="60" value="5" required></label>
                <label><input type="checkbox" name="spectator" checked> Open the host screen instead of playing</label>
                <p role="status" data-host-status></p><div class="actions"><button type="submit" class="primary-btn">Create class game</button><button type="button" class="secondary-btn" data-cancel>Cancel</button></div></form>`;
            const previous = document.activeElement, form = dialog.firstElementChild;
            const close = () => { dialog.close(); dialog.remove(); if (previous?.isConnected) previous.focus(); };
            dialog.addEventListener('cancel', event => { event.preventDefault(); if (!this.hostBusy) close(); });
            form.querySelector('[data-cancel]').addEventListener('click', () => { if (!this.hostBusy) close(); });
            form.addEventListener('submit', async event => {
                event.preventDefault();
                if (this.hostBusy) return;
                this.hostBusy = true;
                form.querySelector('[type="submit"]').disabled = true;
                const key = this.key();
                try {
                    let room = this.pendingLive?.classId === classId && this.app.hostedGameRoom?.room_code === this.pendingLive.code
                        ? this.app.hostedGameRoom : null;
                    if (!room) {
                        if (this.app.hostedGameRoom) throw new Error('Leave your current room before hosting another game.');
                        const deck = await this.app.classrooms.saveClassDeck(classId, deckId);
                        if (key !== this.key()) throw new Error('Your account changed. Reopen the class.');
                        const value = text => ({ value: String(text) });
                        room = await this.app.hostGame({ elements: { nickname: value(this.app.gameNickname()), deckId: value(deck.id),
                            mode: value(form.elements.mode.value), timeLimit: value(form.elements.minutes.value),
                            questionReward: value(this.app.questionRewardRecommendation(form.elements.mode.value).suggested), allowLateJoin: { checked: true } } });
                        this.pendingLive = { classId, code: room.room_code };
                    }
                    if (key !== this.key()) throw new Error('Your account changed. Reopen the class before listing a game.');
                    if (form.elements.spectator.checked && !room.state?.host_spectator) {
                        room = await this.api.setHostMode(room.room_code, true);
                        this.app.hostedGameRoom = room;
                        this.app.renderHostedGameRoom(room);
                    }
                    await this.call('studbud_class_live_game', { p_class_id: classId, p_code: room.room_code });
                    this.pendingLive = null;
                    close();
                    this.app.Router.navigate('multiplayer');
                } catch (error) {
                    form.querySelector('[data-host-status]').textContent = `${this.app.friendlyErrorMessage(error)}${this.pendingLive ? ` Room ${this.pendingLive.code} already exists. Retry to list it, or cancel and use its code from Games.` : ''}`;
                } finally {
                    this.hostBusy = false;
                    form.querySelector('[type="submit"]').disabled = false;
                }
            });
            document.body.appendChild(dialog);
            dialog.showModal();
            form.elements.mode.focus();
        }
    }

    window.StudBudSchoolCommunity = { attach(app) {
        const instance = new SchoolCommunity(app);
        app.schoolCommunity = instance;
        return instance;
    } };
})(window);
