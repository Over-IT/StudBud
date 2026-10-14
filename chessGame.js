(function (window) {
    'use strict';
    const A = window.StudBudArcade;
    const PIECES = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
    const NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
    const VALUES = { k: 0, q: 9, r: 5, b: 3, n: 3, p: 1 };
    const SHAPES = {
        p: '<circle cx="32" cy="18" r="8"/><path d="M26 26h12l4 17H22z"/>',
        r: '<path d="M18 12h7v7h5v-7h5v7h5v-7h7v17l-6 4v12H23V33l-5-4z"/>',
        n: '<path d="M23 44l5-13-11-1 3-13 12-7 11 7 5 27z"/><path d="M32 10l-1-5 8 8"/><circle cx="32" cy="21" r="2" fill="var(--piece-stroke)" stroke="none"/>',
        b: '<path d="M32 7c-13 11-16 20-5 25l-6 12h22l-6-12C48 27 45 18 32 7z"/><path d="M34 15l-6 10" fill="none"/>',
        q: '<path d="M19 43l-6-23 12 10 7-17 7 17 12-10-6 23z"/><circle cx="12" cy="17" r="3"/><circle cx="32" cy="10" r="3"/><circle cx="52" cy="17" r="3"/>',
        k: '<path d="M29 5h6v6h6v6h-6v6h-6v-6h-6v-6h6z"/><path d="M22 24h20l-5 11 6 9H21l6-9z"/>'
    };
    const pieceMarkup = piece => piece === '.' ? '' : `<svg class="chess-piece ${Rules.side(piece) === 0 ? 'white-piece' : 'black-piece'}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="2.5" stroke-linejoin="round">${SHAPES[piece.toLowerCase()]}<path d="M20 44h24l4 8H16z"/><path d="M15 53h34v5H15z"/></g></svg>`;
    const Rules = {
        initial() { return 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR'; },
        side(piece) { return piece === '.' ? -1 : piece === piece.toUpperCase() ? 0 : 1; },
        legal(board, from, to, side) {
            if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 63 || to < 0 || to > 63 || from === to) return false;
            const piece = board[from], target = board[to];
            if (this.side(piece) !== side || this.side(target) === side) return false;
            if (target.toLowerCase() === 'k' && [...board].some(other => this.side(other) === 1 - side && other.toLowerCase() !== 'k')) return false;
            const x = from % 8, y = Math.floor(from / 8), dx = to % 8 - x, dy = Math.floor(to / 8) - y;
            const ax = Math.abs(dx), ay = Math.abs(dy), type = piece.toLowerCase();
            if (type === 'n') return ax * ay === 2;
            if (type === 'k') return Math.max(ax, ay) === 1;
            if (type === 'p') {
                const step = side === 0 ? -1 : 1, start = side === 0 ? 6 : 1;
                if (ax === 1 && dy === step) return target !== '.';
                if (dx !== 0 || target !== '.') return false;
                return dy === step || (y === start && dy === step * 2 && board[from + step * 8] === '.');
            }
            if (type === 'b' && ax !== ay) return false;
            if (type === 'r' && dx !== 0 && dy !== 0) return false;
            if (type === 'q' && dx !== 0 && dy !== 0 && ax !== ay) return false;
            if (!['b', 'r', 'q'].includes(type)) return false;
            const step = Math.sign(dx) + Math.sign(dy) * 8;
            for (let at = from + step; at !== to; at += step) if (board[at] !== '.') return false;
            return true;
        },
        move(board, from, to, side) {
            if (!this.legal(board, from, to, side)) return null;
            const cells = board.split(''), captured = cells[to];
            let piece = cells[from];
            if (piece.toLowerCase() === 'p' && (to < 8 || to >= 56)) piece = side === 0 ? 'Q' : 'q';
            cells[to] = piece; cells[from] = '.';
            return { board: cells.join(''), captured };
        },
        material(board, side) {
            return [...board].reduce((total, piece) => total + (this.side(piece) === side ? VALUES[piece.toLowerCase()] || 0 : 0), 0);
        },
        validState(state) {
            return state && typeof state.board === 'string' && /^[prnbqkPRNBQK.]{64}$/.test(state.board)
                && Number.isInteger(state.serial) && state.serial >= 0 && Number.isInteger(state.revision) && state.revision >= 0
                && [state.credits, state.ack].every(values => Array.isArray(values) && values.length === 2 && values.every(Number.isInteger))
                && state.credits.every(value => value === 0 || value === 1) && state.ack.every(value => value >= 0)
                && Array.isArray(state.capturePoints) && state.capturePoints.length === 2 && state.capturePoints.every(value => Number.isInteger(value) && value >= 0 && value <= 999)
                && [-1, 0, 1].includes(state.winner);
        }
    };

    class Chess extends A.BaseGame {
        constructor(s) {
            super(s);
            this.title = 'Question Chess';
            this.scoreGoal = false;
            this.goalLabel = 'Captured material'; this.goalUnit = 'pts';
            this.selected = -1;
            this.players = [...s.roster.keys()].slice(0, 2);
            if (this.players.length < 2 && (s.practice || s.preview)) this.players = [s.user.id, 'chess-bot'];
            this.side = this.players.indexOf(s.user.id);
            this.authority = s.isHost || s.practice || s.preview;
            const saved = s.room?.state?.chess;
            this.state = Rules.validState(saved) ? JSON.parse(JSON.stringify(saved))
                : { board: Rules.initial(), serial: 0, revision: 0, credits: [0, 0], ack: [0, 0], capturePoints: [0, 0], winner: -1, errors: ['', ''] };
            this.pending = null;
            this.botClock = 0;
            if (!s.preview) this.buildBoard();
            this.updateScore();
        }
        hint() { return 'Q: answer for one move · Drag or select a piece · Capture other pieces before the king'; }
        touchHint() { return 'Answer for one move · Drag or tap a piece · Capture every other piece before the king'; }
        touchLayout() { return { stick: false, buttons: [] }; }
        goalText() { return this.state.winner >= 0 ? 'King captured' : `${this.state.credits[this.side] || 0} move ready · ${this.side === 0 ? 'White' : 'Black'}`; }
        rankMetric(row) { return this.state.winner >= 0 && row.id === this.players[this.state.winner] ? 1000000 : row.g; }
        buildBoard() {
            const panel = document.createElement('section');
            panel.className = 'chess-panel';
            this.s.overlay.classList.toggle('mpg-chess', true);
            panel.innerHTML = `<p class="chess-status" role="status"></p><div class="chess-board" role="group" aria-label="Chess board"></div>
                <button type="button" class="primary-btn chess-question">Answer for a move</button>
                <details class="chess-rules"><summary>Rules &amp; piece values</summary><p>One correct answer earns one move; one ready move can be held. Drag a piece or select it and a destination. The king is protected until every other opposing piece is captured. Captures score pawn 1, knight/bishop 3, rook 5, queen 9. The final king wins the match, without bonus points. Pawns promote to queens. No turns, time limit, check, checkmate, castling or en passant.</p></details>`;
            this.panel = panel;
            this.boardElement = panel.querySelector('.chess-board');
            this.statusElement = panel.querySelector('.chess-status');
            const squares = [];
            for (let displayed = 0; displayed < 64; displayed++) {
                const at = this.side === 1 ? 63 - displayed : displayed;
                squares.push(`<button type="button" class="chess-square ${(Math.floor(at / 8) + at % 8) % 2 ? 'dark' : 'light'}" data-square="${at}"></button>`);
            }
            this.boardElement.innerHTML = squares.join('');
            this.squares = [...this.boardElement.querySelectorAll('[data-square]')];
            panel.addEventListener('click', event => {
                if (event.detail > 0 && performance.now() < (this.ignoreClickUntil || 0)) return;
                const square = event.target.closest('[data-square]');
                if (square) this.selectSquare(Number(square.dataset.square));
                else if (event.target.closest('.chess-question')) this.recharge();
            });
            panel.addEventListener('pointerdown', event => this.startDrag(event));
            panel.addEventListener('pointermove', event => this.moveDrag(event));
            panel.addEventListener('pointerup', event => this.endDrag(event));
            panel.addEventListener('pointercancel', () => this.cancelDrag());
            panel.addEventListener('lostpointercapture', () => this.cancelDrag());
            this.s.overlay.appendChild(panel);
            this.renderBoard();
        }
        renderBoard() {
            if (!this.panel) return;
            const state = this.state;
            const ready = state.credits[this.side] === 1 && !this.pending && !this.s.over;
            for (const square of this.squares) {
                const at = Number(square.dataset.square), piece = state.board[at];
                const rank = (this.side === 1 ? at % 8 === 7 : at % 8 === 0) ? String(8 - Math.floor(at / 8)) : '';
                if (square.dataset.piece !== piece) {
                    square.innerHTML = pieceMarkup(piece) + (rank ? `<span class="chess-rank">${rank}</span>` : '');
                    square.dataset.piece = piece;
                }
                square.dataset.rank = rank;
                square.dataset.file = (this.side === 1 ? at < 8 : at >= 56) ? 'abcdefgh'[at % 8] : '';
                const label = `${'abcdefgh'[at % 8]}${8 - Math.floor(at / 8)}: ${piece === '.' ? 'empty' : `${Rules.side(piece) === 0 ? 'white' : 'black'} ${NAMES[piece.toLowerCase()]}`}`;
                square.setAttribute('aria-label', label);
                square.setAttribute('aria-pressed', String(this.selected === at));
                square.classList.toggle('selected', this.selected === at);
                const legal = ready && this.selected >= 0 && Rules.legal(state.board, this.selected, at, this.side);
                square.classList.toggle('legal', legal && piece === '.');
                square.classList.toggle('capture', legal && piece !== '.');
                square.classList.toggle('last-move', Boolean(this.lastMove?.includes(at)));
            }
            this.statusElement.textContent = state.winner >= 0 ? `${state.winner === 0 ? 'White' : 'Black'} captured the king!`
                : this.pending ? 'Waiting for the host to confirm…'
                    : `${this.side === 0 ? 'White' : 'Black'} · ${ready ? 'Move ready: drag a piece or select its destination' : 'Answer a question to earn your next move'}`;
            this.panel.querySelector('.chess-question').disabled = ready || Boolean(this.pending) || state.winner >= 0 || this.s.over;
        }
        canMove() { return Boolean(this.state.credits[this.side]) && !this.pending && !this.s.question && !this.s.paused && !this.s.over && this.s.countdown <= 0 && this.state.winner < 0; }
        startDrag(event) {
            const square = event.target.closest('[data-square]');
            if (!square || event.button !== 0 || this.drag || !this.canMove()) return;
            const from = Number(square.dataset.square);
            if (Rules.side(this.state.board[from]) !== this.side) return;
            this.drag = { id: event.pointerId, from, square, x: event.clientX, y: event.clientY, revision: this.state.revision, moved: false };
            this.selected = from;
            this.renderBoard();
            square.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        }
        moveDrag(event) {
            const drag = this.drag;
            if (!drag || drag.id !== event.pointerId) return;
            if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
            if (!drag.moved) {
                drag.moved = true;
                drag.square.classList.add('dragging');
                this.ghost = document.createElement('span');
                this.ghost.className = 'chess-drag-ghost';
                this.ghost.setAttribute('aria-hidden', 'true');
                this.ghost.innerHTML = pieceMarkup(this.state.board[drag.from]);
                this.panel.appendChild(this.ghost);
            }
            this.ghost.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
            event.preventDefault();
        }
        endDrag(event) {
            const drag = this.drag;
            if (!drag || drag.id !== event.pointerId) return;
            if (drag.moved) {
                this.ignoreClickUntil = performance.now() + 350;
                const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-square]');
                const to = target && this.boardElement.contains(target) ? Number(target.dataset.square) : -1;
                if (this.canMove() && drag.revision === this.state.revision && Rules.legal(this.state.board, drag.from, to, this.side)) {
                    this.request({ kind: 'move', from: drag.from, to, revision: drag.revision });
                    this.selected = -1;
                } else this.s.toast('That move is unavailable. Your move credit was kept.', '#fbbf24');
            }
            this.cancelDrag();
            this.renderBoard();
        }
        cancelDrag() {
            if (!this.drag) return;
            const { square, id, moved } = this.drag;
            this.drag = null;
            if (moved) this.ignoreClickUntil = performance.now() + 350;
            square.classList.remove('dragging');
            this.ghost?.remove(); this.ghost = null;
            if (square.hasPointerCapture?.(id)) square.releasePointerCapture(id);
        }
        selectSquare(at) {
            if (this.s.question || this.s.paused || this.s.over || this.s.countdown > 0 || this.state.winner >= 0) return;
            if (!this.state.credits[this.side]) { this.recharge(); return; }
            if (this.pending) return;
            if (Rules.side(this.state.board[at]) === this.side) this.selected = at;
            else if (this.selected >= 0) {
                if (!Rules.legal(this.state.board, this.selected, at, this.side)) { this.s.toast('That piece cannot move there.', '#fbbf24'); return; }
                this.request({ kind: 'move', from: this.selected, to: at, revision: this.state.revision });
                this.selected = -1;
            }
            this.renderBoard();
        }
        recharge() {
            if (this.s.preview || this.s.question || this.s.paused || this.s.over || this.s.countdown > 0 || this.pending || this.state.winner >= 0) return;
            if (this.state.credits[this.side]) { this.s.toast('Use your ready move before answering again.', '#fbbf24'); return; }
            this.s.ask(correct => {
                if (correct) {
                    const answer = this.s.questionHistory[this.s.questionHistory.length - 1];
                    this.request({ kind: 'answer', cardIndex: this.s.lastCardIndex, answer: answer.chosen });
                }
            }, 'Correct answer: one chess move', true);
        }
        request(request) {
            const seq = this.state.ack[this.side] + 1;
            if (this.authority) this.handleRequest({ ...request, seq }, this.s.user.id);
            else {
                this.pending = { ...request, seq };
                this.pendingSince = Date.now();
                this.pendingWarned = false;
                this.renderBoard();
                this.s.sendState();
            }
        }
        handleRequest(request, userId) {
            const side = this.players.indexOf(userId);
            if (!this.authority || side < 0 || !request || this.state.winner >= 0 || request.seq !== this.state.ack[side] + 1) return;
            if (request.kind === 'answer' && !this.s.cards.length) return;
            let error = '';
            if (request.kind === 'answer') {
                const card = Number.isInteger(request.cardIndex) ? this.s.cards[request.cardIndex] : null;
                if (!card || window.FlashcardTools.answerKey(request.answer) !== window.FlashcardTools.answerKey(card.back)) error = 'The answer did not earn a move.';
                else this.state.credits[side] = 1;
            } else if (request.kind === 'move') {
                const next = request.revision === this.state.revision && this.state.credits[side] === 1
                    ? Rules.move(this.state.board, request.from, request.to, side) : null;
                if (!next) error = 'The board changed or that move is invalid. Your move credit was kept; choose again.';
                else {
                    this.state.board = next.board;
                    this.state.capturePoints[side] += VALUES[next.captured.toLowerCase()] || 0;
                    this.lastMove = [request.from, request.to];
                    this.state.credits[side] = 0;
                    this.state.revision++;
                    if (next.captured.toLowerCase() === 'k') this.state.winner = side;
                }
            } else return;
            this.state.ack[side] = request.seq;
            this.state.errors[side] = error;
            this.state.serial++;
            if (error && userId === this.s.user.id) this.s.toast(error, '#fbbf24');
            this.updateScore();
            this.renderBoard();
            if (!this.s.practice && !this.s.preview) {
                this.persistPromise = this.s.api.saveChessState(this.s.code, JSON.parse(JSON.stringify(this.state)));
                this.persistPromise.catch(error => {
                    console.error('[Chess] Board persistence failed:', error);
                    this.s.toast('Board sync failed. Keep this host connected; reconnecting may lose recent moves.', '#f87171');
                });
                this.s.sendState();
            }
        }
        net() { return { x: 0, y: 0, ex: this.authority ? { chess: this.state } : { chessRequest: this.pending } }; }
        onState(ex, from) {
            if (this.authority) { if (ex?.chessRequest) this.handleRequest(ex.chessRequest, from.id); return; }
            const state = ex?.chess;
            if (from.id !== this.s.room.host_id || !Rules.validState(state) || state.serial < this.state.serial) return;
            if (state.serial === this.state.serial && !this.pending) return;
            this.state = JSON.parse(JSON.stringify(state));
            this.cancelDrag();
            this.selected = -1;
            if (this.pending && state.ack[this.side] >= this.pending.seq) {
                this.pending = null;
                if (state.errors?.[this.side]) this.s.toast(state.errors[this.side], '#fbbf24');
            }
            this.updateScore();
            this.renderBoard();
        }
        onRoom(room) {
            if (!this.authority && room.state?.chess) this.onState({ chess: room.state.chess }, { id: room.host_id });
        }
        updateScore() {
            const score = side => this.state.capturePoints[side];
            this.s.setGoal(score(this.side));
            this.s.score = score(this.side);
            for (let side = 0; side < this.players.length; side++) {
                const remote = this.s.remotes?.get?.(this.players[side]);
                if (remote) { remote.goal = score(side); remote.score = score(side); }
            }
            this.finished = this.state.winner >= 0;
        }
        update(dt) {
            if (this.finished || this.s.over) return;
            if (this.pending && !this.pendingWarned && Date.now() - this.pendingSince > 6000) {
                this.pendingWarned = true;
                this.s.toast('Waiting for the chess host. Reconnecting will retry this request without spending another move.', '#fbbf24');
            }
            if (this.s.pressed('KeyQ')) this.recharge();
            if (this.s.practice || this.s.preview) {
                this.botClock += dt;
                const opponent = 1 - Math.max(0, this.side);
                if (this.botClock >= 6) {
                    this.botClock = 0;
                    const moves = [];
                    for (let from = 0; from < 64; from++) for (let to = 0; to < 64; to++) {
                        if (Rules.legal(this.state.board, from, to, opponent)) moves.push({ from, to, value: VALUES[this.state.board[to].toLowerCase()] || (this.state.board[to].toLowerCase() === 'k' ? 1000 : 0) });
                    }
                    moves.sort((a, b) => b.value - a.value);
                    if (moves.length) {
                        const best = moves.filter(move => move.value === moves[0].value);
                        const move = best[Math.floor(Math.random() * best.length)];
                        this.state.credits[opponent] = 1;
                        this.handleRequest({ kind: 'move', ...move, revision: this.state.revision, seq: this.state.ack[opponent] + 1 }, this.players[opponent]);
                    }
                }
            }
        }
        draw(ctx, w, h) {
            ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h);
            if (!this.s.preview) return;
            const size = Math.min(w, h) * .86, cell = size / 8, x = (w - size) / 2, y = (h - size) / 2;
            for (let at = 0; at < 64; at++) {
                ctx.fillStyle = (Math.floor(at / 8) + at % 8) % 2 ? '#64748b' : '#e2e8f0';
                ctx.fillRect(x + at % 8 * cell, y + Math.floor(at / 8) * cell, cell, cell);
                ctx.fillStyle = Rules.side(this.state.board[at]) === 0 ? '#fff' : '#111827';
                ctx.font = `${cell * .78}px serif`; ctx.textAlign = 'center';
                ctx.fillText(PIECES[this.state.board[at]] || '', x + (at % 8 + .5) * cell, y + (Math.floor(at / 8) + .8) * cell);
            }
        }
    }
    A.ChessRules = Rules;
    A.games.chess = Chess;
})(window);
