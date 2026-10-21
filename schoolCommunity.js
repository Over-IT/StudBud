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

    class SchoolCommunity {
        constructor(app) {
            this.app = app;
            this.classId = null;
            this.classTitle = '';
            this.tab = 'people';
            this.request = 0;
            this.drafts = new Map();
            this.context = '';
            document.addEventListener('click', event => this.onClick(event));
            document.addEventListener('submit', event => this.onSubmit(event));
            document.addEventListener('change', event => {
                if (event.target.id === 'community-class') this.open(event.target.value || null);
            });
            document.addEventListener('input', event => {
                const form = event.target.closest?.('[data-community-compose]');
                if (form) this.drafts.set(this.draftKey(form.dataset.parent || ''), {
                    body: form.elements.body.value, kind: form.elements.kind?.value || 'discussion'
                });
            });
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
            this.pendingLive = null;
            this.drafts.clear();
            if (this.root) this.root.innerHTML = '';
        }
        current(id, key) { return this.available() && id === this.request && key === this.key(); }
        draftKey(parent) { return `${this.context}|${this.classId || 'school'}|${parent}`; }
        status(message, error = false) {
            const node = document.getElementById('school-community-status');
            if (node) { node.textContent = message; node.classList.toggle('error', error); }
        }
        async open(classId, title = '') {
            this.resetContext();
            this.classId = classId;
            this.classTitle = title;
            this.tab = classId ? 'updates' : 'people';
            if (this.app.Router.activeRoute === 'school-community') await this.render();
            else this.app.Router.navigate('school-community');
        }
        async render() {
            this.resetContext();
            if (!this.root) return;
            if (!this.available()) {
                this.root.innerHTML = '<div class="glass-card empty-state">Sign in, connect and choose your supported school to use School community.</div>';
                return;
            }
            const id = ++this.request, key = this.key(), classId = this.classId;
            this.root.innerHTML = '<p role="status">Loading school community…</p>';
            try {
                const [data, listing] = await Promise.all([
                    this.call('studbud_school_community', { p_class_id: classId }),
                    this.app.classrooms.call(this.app.classrooms.isTeacher() ? 'studbud_teacher_classes' : 'studbud_my_classes',
                        this.app.classrooms.isTeacher() ? {} : { p_course_codes: this.app.classrooms.courseCodes() })
                ]);
                if (!this.current(id, key)) return;
                this.data = data;
                this.classes = listing.classes || [];
                this.classTitle = this.classes.find(item => item.id === classId)?.title || this.classTitle;
                this.paint();
            } catch (error) {
                if (this.current(id, key)) {
                    this.root.innerHTML = `<div class="glass-card"><p role="alert">${esc(this.app.friendlyErrorMessage(error))}</p><button type="button" class="secondary-btn" data-school-action="refresh">Try again</button></div>`;
                }
            }
        }
        paint() {
            const data = this.data;
            const tabs = this.classId ? [['updates', 'Updates'], ['people', 'Classmates'], ['sets', 'Shared sets']]
                : [['people', 'Schoolmates'], ['sets', 'Shared sets']];
            this.root.innerHTML = `<header class="view-header"><div><h2>${esc(this.classId ? this.classTitle || 'Class community' : this.app.schoolShortName?.() || 'School community')}</h2>
                <p>${this.classId ? 'Class announcements, study questions and games. Course membership is self-reported, not a verified class roster.' : 'Find opted-in schoolmates and publicly shared study sets. Your grades and private sets stay private.'}</p></div>
                <button type="button" class="secondary-btn" data-school-action="refresh">Refresh</button></header>
                <div class="community-toolbar"><label for="community-class">Community<select id="community-class"><option value="">Whole school</option>${(this.classes || []).map(item =>
                    `<option value="${esc(item.id)}"${item.id === this.classId ? ' selected' : ''}>${esc(item.title)}${item.section ? ` · ${esc(item.section)}` : ''}</option>`).join('')}</select></label>
                <button type="button" class="text-btn" data-target="friends-view">Manage buds &amp; requests</button>
                ${this.classId ? '<button type="button" class="text-btn" data-target="classes-view">Class flashcard sets</button>' : ''}</div>
                <p id="school-community-status" role="status" aria-live="polite"></p>
                <div id="community-live">${this.liveMarkup(data.live || [], this.classId, data.can_announce)}</div>
                <nav class="community-tabs" aria-label="Community sections">${tabs.map(([tab, label]) =>
                    `<button type="button" class="secondary-btn${this.tab === tab ? ' selected' : ''}" data-school-action="tab" data-tab="${tab}"${this.tab === tab ? ' aria-current="page"' : ''}>${label}</button>`).join('')}</nav>
                <div id="community-content">${this.tab === 'updates' ? this.updatesMarkup() : this.tab === 'sets' ? this.setsMarkup() : this.peopleMarkup()}</div>`;
        }
        liveMarkup(rooms, classId, teacher = false) {
            if (!rooms.length) return classId ? '<p class="settings-hint">No class game is live right now. Your teacher can host from a class set.</p>' : '';
            return rooms.map(room => `<article class="glass-card community-live-card"><div><span class="eyebrow">Live class game · ${esc(room.status === 'waiting' ? 'Lobby open' : 'In progress')}</span>
                <h3>${esc(room.deck_title)}</h3><p>${esc(room.teacher_username)} · ${esc(GAME_NAMES[room.mode] || room.mode)} · Code <strong>${esc(room.room_code)}</strong></p></div>
                <div class="actions"><button type="button" class="primary-btn" data-school-action="join" data-code="${esc(room.room_code)}"${room.joinable === false ? ' disabled' : ''}>${room.joinable === false ? 'Joining closed' : 'Join game'}</button>
                ${teacher ? `<button type="button" class="text-btn" data-school-action="unlist" data-class="${esc(classId)}">Remove listing</button>` : ''}</div></article>`).join('');
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
            return `<section><header class="view-header"><div><h3>Public study sets ${this.classId ? 'for this course' : 'from your school'}</h3><p>Only intentionally published sets appear here. Your teacher's class sets stay in Classrooms.</p></div>
                <button type="button" class="secondary-btn" data-target="study-manage-view">Manage &amp; share your sets</button></header>
                <p class="settings-hint">Authors must also share their school publicly, or both of you must enable school discovery, to appear in school-scoped lists.</p>
                <div class="community-set-grid">${(this.data.decks || []).map(deck => `<article class="glass-card"><h4>${esc(deck.title)}</h4>
                    <p>${esc(deck.author)} · ${Number(deck.card_count) || 0} cards${deck.course_title ? ` · ${esc(deck.course_title)}` : ''}</p>
                    <button type="button" class="primary-btn" data-school-action="save-set" data-id="${esc(deck.id)}">Add to my sets</button>
                    <button type="button" class="text-btn" data-action="report-content" data-report-type="deck" data-id="${esc(deck.id)}" data-name="${esc(deck.title)}">Report</button></article>`).join('') || '<div class="glass-card empty-state">No public sets here yet. Share a set from Manage sets when you are ready.</div>'}</div></section>`;
        }
        composeMarkup(parent = '') {
            const draft = this.drafts.get(this.draftKey(parent));
            return `<form data-community-compose data-parent="${esc(parent)}" class="community-compose">
                ${!parent && this.data.can_announce ? `<label>Post type<select name="kind"><option value="discussion">Discussion</option><option value="announcement"${draft?.kind === 'announcement' ? ' selected' : ''}>Teacher announcement</option></select></label>` : ''}
                <label>${parent ? 'Your reply' : 'Ask a study question or share an update'}<textarea name="body" rows="${parent ? 2 : 3}" required maxlength="2000" placeholder="Keep it helpful. Do not post private information or test answers.">${esc(draft?.body || '')}</textarea></label>
                <button type="submit" class="primary-btn">${parent ? 'Reply' : 'Post to class'}</button></form>`;
        }
        updatesMarkup() {
            return `<section class="glass-card"><h3>Class updates</h3><p class="settings-hint">Everyone in this class can read discussions. Teachers can post announcements and remove posts. Use Report for bullying, spam or other concerns.</p>
                ${this.composeMarkup()}</section><div id="community-posts" class="community-posts">${(this.data.posts || []).map(post => this.postMarkup(post)).join('') || '<p class="glass-card empty-state">No updates yet. Start with a study question.</p>'}</div>
                ${this.moreMarkup(this.data.next_before, 'posts')}`;
        }
        moreMarkup(cursor, type, parent = '') {
            return cursor ? `<button type="button" class="secondary-btn community-more" data-school-action="more-${type}" data-before="${esc(cursor)}" data-parent="${esc(parent)}">Load older ${type === 'posts' ? 'updates' : 'replies'}</button>` : '';
        }
        postMarkup(post, reply = false) {
            const own = post.author_id === window.StudBudCloud?.user?.id;
            return `<article class="glass-card community-post${reply ? ' community-reply' : ''}" data-post="${esc(post.id)}">
                <header><strong>${post.kind === 'announcement' ? 'Teacher announcement · ' : ''}@${esc(post.username)}</strong><time datetime="${esc(post.created_at)}">${esc(stamp(post.created_at))}</time></header>
                <p class="community-body">${esc(post.body)}</p><div class="actions">
                ${!reply ? `<button type="button" class="text-btn" data-school-action="replies" data-id="${esc(post.id)}">${Number(post.reply_count) || 0} replies · Open discussion</button>` : ''}
                <button type="button" class="text-btn" data-school-action="report" data-id="${esc(post.id)}">Report</button>
                ${own || this.data.can_announce ? `<button type="button" class="text-btn" data-school-action="delete" data-id="${esc(post.id)}">Delete</button>` : ''}</div>
                ${!reply ? `<div id="community-thread-${esc(post.id)}" class="community-thread"></div>` : ''}</article>`;
        }
        async poll() {
            if (document.hidden || !this.available() || this.polling) return;
            if (this.app.Router.activeRoute === 'classes') return this.refreshClassListings();
            if (this.app.Router.activeRoute !== 'school-community' || !this.data || !this.classId) return;
            this.polling = true;
            const id = this.request, key = this.key(), classId = this.classId;
            try {
                const data = await this.call('studbud_school_community', { p_class_id: classId });
                if (!this.current(id, key) || this.app.Router.activeRoute !== 'school-community') return;
                this.data.live = data.live;
                const live = document.getElementById('community-live');
                if (live) live.innerHTML = this.liveMarkup(data.live || [], classId, data.can_announce);
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
                        node.innerHTML = this.liveMarkup(data.live || [], node.dataset.schoolLive, data.can_announce);
                    } catch (error) {
                        if (key === this.key() && node.isConnected) node.textContent = this.app.friendlyErrorMessage(error);
                    }
                }));
            } finally { this.classListingsBusy = false; }
        }
        async onSubmit(event) {
            const form = event.target;
            if (!form.matches?.('[data-community-compose]')) return;
            event.preventDefault();
            const button = form.querySelector('[type="submit"]');
            if (button.disabled) return;
            button.disabled = true;
            const id = this.request, key = this.key(), parent = form.dataset.parent || '';
            try {
                if (!this.classId) throw new Error('Choose a class before posting.');
                await this.call('studbud_community_post', { p_class_id: this.classId, p_body: form.elements.body.value.trim(),
                    p_kind: form.elements.kind?.value || 'discussion', p_parent_id: parent || null });
                if (!this.current(id, key)) return;
                this.drafts.delete(this.draftKey(parent));
                if (parent) await this.loadReplies(parent);
                else await this.render();
                this.status('Posted to your class.');
            } catch (error) {
                if (this.current(id, key)) this.status(this.app.friendlyErrorMessage(error), true);
            } finally { if (button.isConnected) button.disabled = false; }
        }
        async loadReplies(postId, before = null) {
            const id = this.request, key = this.key();
            const data = await this.call('studbud_community_replies', { p_post_id: postId, p_before: before });
            if (!this.current(id, key)) return;
            const thread = document.getElementById(`community-thread-${postId}`);
            if (!thread) return;
            const rows = (data.posts || []).map(post => this.postMarkup(post, true)).join('');
            if (before) {
                thread.querySelector('.community-more')?.remove();
                thread.querySelector('.community-replies').insertAdjacentHTML('beforeend', rows);
                thread.querySelector('.community-replies').insertAdjacentHTML('afterend', this.moreMarkup(data.next_before, 'replies', postId));
            } else thread.innerHTML = `<div class="community-replies">${rows || '<p>No replies yet.</p>'}</div>${this.moreMarkup(data.next_before, 'replies', postId)}${this.composeMarkup(postId)}`;
        }
        async onClick(event) {
            const button = event.target.closest('[data-school-action]');
            if (!button || button.disabled) return;
            const action = button.dataset.schoolAction;
            button.disabled = true;
            const id = this.request, key = this.key();
            try {
                if (action === 'open-class') await this.open(button.dataset.class, button.dataset.title);
                else if (action === 'refresh') await this.render();
                else if (action === 'tab') { this.tab = button.dataset.tab; this.paint(); }
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
                } else if (action === 'replies') await this.loadReplies(button.dataset.id);
                else if (action === 'more-replies') await this.loadReplies(button.dataset.parent, button.dataset.before);
                else if (action === 'more-posts') {
                    const data = await this.call('studbud_school_community', { p_class_id: this.classId, p_before: button.dataset.before });
                    if (!this.current(id, key)) return;
                    document.getElementById('community-posts').insertAdjacentHTML('beforeend', (data.posts || []).map(post => this.postMarkup(post)).join(''));
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
                    if (this.app.Router.activeRoute === 'school-community' && this.current(id, key)) await this.render();
                    else await this.refreshClassListings();
                }
            } catch (error) {
                const message = this.app.friendlyErrorMessage(error);
                if (this.app.Router.activeRoute === 'school-community') this.status(message, true);
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
