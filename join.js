(function (window) {
    'use strict';

    const cloud = window.StudBudCloud;
    const api = window.StudBudCommunityGames;
    const form = document.getElementById('join-form');
    const entry = document.getElementById('join-entry');
    const lobby = document.getElementById('join-lobby');
    const leaveButton = document.getElementById('join-leave');
    let room = null, session = null, timer = null, unwatch = null, refreshing = false;

    function status(message, error = false) {
        const element = document.getElementById('join-status');
        element.textContent = message;
        element.classList.toggle('error', error);
    }

    function stopWatching() {
        window.clearInterval(timer);
        timer = null;
        unwatch?.();
        unwatch = null;
    }

    function closeRoom(message = '') {
        stopWatching();
        session?.destroy();
        session = null;
        room = null;
        document.body.classList.remove('mpg-active');
        lobby.classList.add('hidden');
        entry.classList.remove('hidden');
        status(message);
        form.elements.roomCode.focus();
    }

    async function leave() {
        if (!room || leaveButton.disabled) return;
        leaveButton.disabled = true;
        try {
            await api.leaveRoom(room.room_code);
            closeRoom('You left the game. Enter a code to join another.');
        } catch (error) {
            console.error('[Guest join] Leaving failed:', error);
            status(error.message, true);
            window.StudBudDialogs.notify(error.message);
        } finally { leaveButton.disabled = false; }
    }

    function render(nextRoom) {
        room = nextRoom;
        document.getElementById('join-room-title').textContent = room.deck_title || 'Game lobby';
        document.getElementById('join-room-code').textContent = room.room_code;
        document.getElementById('join-room-state').textContent = room.status === 'waiting'
            ? 'You are ready! Wait for your host to start.'
            : room.status === 'finished' ? 'Game finished. Your host can start another round.' : 'Your game is live.';
        const players = document.getElementById('join-players');
        players.replaceChildren();
        const roster = [...(room.state?.players || [])];
        if (room.status === 'finished') roster.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
        for (const player of roster) {
            const item = document.createElement('li');
            item.textContent = `${player.nickname}${player.id === cloud.guestUser.id ? ' (you)' : ''}${room.status === 'finished' ? ` - ${Number(player.score || 0)} points` : ''}`;
            players.appendChild(item);
        }
        if (room.status === 'playing' && !session) {
            if (!window.StudBudArcade?.games[room.mode]) throw new Error('This game mode could not load. Reload the page to try again.');
            session = new window.StudBudArcade.Session({
                room, user: cloud.guestUser, api, isHost: false,
                studySet: { title: room.deck_title, publicId: room.state?.public_deck_id },
                onLeave: leave
            });
            document.body.classList.add('mpg-active');
        } else if (session && room.status === 'waiting') {
            session.destroy();
            session = null;
            document.body.classList.remove('mpg-active');
        } else session?.updateRoom(room);
    }

    async function refresh() {
        if (!room || refreshing) return;
        const code = room.room_code;
        refreshing = true;
        try {
            const nextRoom = await api.getRoom(code);
            if (room?.room_code !== code) return;
            render(nextRoom);
            status('');
        } catch (error) {
            if (room?.room_code !== code) return;
            console.error('[Guest join] Refresh failed:', error);
            if (/not in this game/i.test(error.message)) closeRoom('You left the game or were removed by your host.');
            else status(`Connection problem: ${error.message}`, true);
        } finally { refreshing = false; }
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        if (button.disabled || room || !form.reportValidity()) return;
        const code = form.elements.roomCode.value.trim().toUpperCase();
        const nickname = form.elements.nickname.value.trim();
        if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code) || !/^[A-Za-z0-9 _-]{2,20}$/.test(nickname)) {
            status('Enter a valid 6-character code and a player name with 2-20 characters.', true);
            return;
        }
        button.disabled = true;
        status('Joining as a guest...');
        try {
            if (window.navigator.onLine === false) throw new Error('Joining a live game needs an internet connection.');
            await cloud.prepareGuestSession();
            const joined = await api.joinRoom(code, nickname);
            room = joined;
            entry.classList.add('hidden');
            lobby.classList.remove('hidden');
            document.getElementById('join-room-title').setAttribute('tabindex', '-1');
            document.getElementById('join-room-title').focus();
            timer = window.setInterval(refresh, 1500);
            try { unwatch = api.watchRoom(code, refresh); }
            catch (error) { console.warn('[Guest join] Realtime unavailable; polling remains active:', error); }
            render(joined);
            status('');
        } catch (error) {
            console.error('[Guest join] Joining failed:', error);
            status(error.message, true);
        } finally { button.disabled = false; }
    });
    leaveButton.addEventListener('click', leave);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    window.addEventListener('online', refresh);
    window.addEventListener('pagehide', () => { stopWatching(); session?.destroy(); });
    window.addEventListener('pageshow', event => {
        if (event.persisted && room) { session = null; timer = window.setInterval(refresh, 1500); refresh(); }
    });
    if ('serviceWorker' in window.navigator) {
        window.navigator.serviceWorker.register(new URL('../service-worker.js', document.baseURI))
            .catch(error => console.error('[Guest join] Offline page support could not start:', error));
    }
})(window);
