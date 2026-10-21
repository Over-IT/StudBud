(function (window) {
    'use strict';
    const A = window.StudBudArcade;
    const NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
    const VALUES = { k: 0, q: 9, r: 5, b: 3, n: 3, p: 1 };
    // Original silhouettes shared by the SVG board, drag ghost and canvas previews.
    const SHAPES = {
        p: ['M40 18a8 8 0 1 1-16 0 8 8 0 1 1 16 0Z', 'M27 26h10c-1 8 0 13 6 19H21c6-6 7-11 6-19Z'],
        r: ['M18 11h7v8h5v-8h5v8h5v-8h7v17l-7 5 2 12H22l2-12-6-5Z', 'M23 29h18'],
        n: ['M21 45c0-9 5-13 12-18l-8 4-9-5 6-12 9-3 2-6 8 8c8 8 7 20 6 32Z', 'M23 17l7-3M35 23c5 4 5 11 2 17', 'M29 20h1'],
        b: ['M32 7c-5 5-13 11-13 18 0 5 4 8 9 9-1 4-4 8-7 11h22c-3-3-6-7-7-11 5-1 9-4 9-9 0-7-8-13-13-18Z', 'M35 15l-7 12M25 35h14'],
        q: ['M20 44l-6-23 11 9 7-16 7 16 11-9-6 23Z', 'M16 16a3 3 0 1 1-6 0 3 3 0 1 1 6 0ZM35 10a3 3 0 1 1-6 0 3 3 0 1 1 6 0ZM54 16a3 3 0 1 1-6 0 3 3 0 1 1 6 0Z', 'M21 38h22'],
        k: ['M29 5h6v6h6v6h-6v8h-6v-8h-6v-6h6Z', 'M32 27c-8-10-18-4-15 4l8 14h14l8-14c3-8-7-14-15-4Z', 'M25 37h14']
    };
    const BASE = ['M21 44h22l5 8H16Z', 'M17 52h30l3 6H14Z'];
    const PREVIEW_PATHS = new Map();
    const previewPath = d => { if (!PREVIEW_PATHS.has(d)) PREVIEW_PATHS.set(d, new Path2D(d)); return PREVIEW_PATHS.get(d); };
    const PALETTE = [{ fill: '#f8f4e7', stroke: '#3c4038', shine: '#ffffff' }, { fill: '#454943', stroke: '#222820', shine: '#798174' }];
    const pieceMarkup = piece => piece === '.' ? '' : `<svg class="chess-piece ${Rules.side(piece) === 0 ? 'white-piece' : 'black-piece'}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${[...SHAPES[piece.toLowerCase()], ...BASE].map(d => `<path d="${d}"/>`).join('')}<path d="M22 48h20M20 55h24" fill="none" stroke="var(--piece-shine)" stroke-width="1.8" opacity=".65"/></g></svg>`;
    const Rules = {
        initial() { return 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR'; },
        side(piece) { return piece === '.' ? -1 : piece === piece.toUpperCase() ? 0 : 1; },
        attacked(board, at, side) {
            for (let from = 0; from < 64; from++) {
                if (this.side(board[from]) !== side) continue;
                const dx = Math.abs(from % 8 - at % 8), dy = Math.floor(at / 8) - Math.floor(from / 8);
                const type = board[from].toLowerCase();
                if (type === 'p') { if (dx === 1 && dy === (side === 0 ? -1 : 1)) return true; }
                else if (type === 'k') { if (Math.max(dx, Math.abs(dy)) === 1) return true; }
                else if (this.pseudo(board, from, at, side, {}, true)) return true;
            }
            return false;
        },
        inCheck(board, side) {
            const king = board.indexOf(side === 0 ? 'K' : 'k');
            return king >= 0 && this.attacked(board, king, 1 - side);
        },
        pseudo(board, from, to, side, state = {}, attack = false) {
            if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 63 || to < 0 || to > 63 || from === to) return false;
            const piece = board[from], target = board[to];
            if (this.side(piece) !== side || this.side(target) === side) return false;
            if (!attack && target.toLowerCase() === 'k') return false;
            const x = from % 8, y = Math.floor(from / 8), dx = to % 8 - x, dy = Math.floor(to / 8) - y;
            const ax = Math.abs(dx), ay = Math.abs(dy), type = piece.toLowerCase();
            if (type === 'n') return ax * ay === 2;
            if (type === 'k') {
                if (Math.max(ax, ay) === 1) return true;
                const home = side === 0 ? 60 : 4, kingside = dx === 2;
                const rook = home + (kingside ? 3 : -4);
                if (from !== home || dy !== 0 || ax !== 2 || !state.castling?.[side * 2 + (kingside ? 0 : 1)]
                    || board[rook] !== (side === 0 ? 'R' : 'r') || this.inCheck(board, side)) return false;
                const step = Math.sign(dx);
                for (let at = home + step; at !== rook; at += step) if (board[at] !== '.') return false;
                const cells = board.split('');
                cells[home] = '.';
                for (const at of [home + step, to]) {
                    cells[at] = piece;
                    if (this.attacked(cells.join(''), at, 1 - side)) return false;
                    cells[at] = '.';
                }
                return true;
            }
            if (type === 'p') {
                const step = side === 0 ? -1 : 1, start = side === 0 ? 6 : 1;
                if (ax === 1 && dy === step) return target !== '.' || (state.enPassant === from + dx
                    && board[from + dx] === (side === 0 ? 'p' : 'P') && y === (side === 0 ? 3 : 4));
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
        apply(board, from, to, side, state = {}) {
            const cells = board.split('');
            let captured = cells[to];
            let piece = cells[from];
            const type = piece.toLowerCase();
            const castling = [...(state.castling || [false, false, false, false])];
            if (type === 'p' && from % 8 !== to % 8 && captured === '.') {
                const at = to + (side === 0 ? 8 : -8);
                captured = cells[at]; cells[at] = '.';
            }
            if (type === 'k') {
                castling[side * 2] = castling[side * 2 + 1] = false;
                if (Math.abs(from - to) === 2) {
                    const rook = from + (to > from ? 3 : -4);
                    cells[from + Math.sign(to - from)] = cells[rook]; cells[rook] = '.';
                }
            }
            for (const [index, home] of [63, 56, 7, 0].entries()) {
                if (from === home || to === home) castling[index] = false;
            }
            if (piece.toLowerCase() === 'p' && (to < 8 || to >= 56)) piece = side === 0 ? 'Q' : 'q';
            cells[to] = piece; cells[from] = '.';
            return { board: cells.join(''), captured, castling, enPassant: type === 'p' && Math.abs(to - from) === 16 ? to : -1 };
        },
        legal(board, from, to, side, state = {}) {
            if (this.inCheck(board, 1 - side) || !this.pseudo(board, from, to, side, state)) return false;
            return !this.inCheck(this.apply(board, from, to, side, state).board, side);
        },
        move(board, from, to, side, state = {}) {
            return this.legal(board, from, to, side, state) ? this.apply(board, from, to, side, state) : null;
        },
        hasMove(board, side, state) {
            for (let from = 0; from < 64; from++) {
                if (this.side(board[from]) !== side) continue;
                for (let to = 0; to < 64; to++) if (this.legal(board, from, to, side, state)) return true;
            }
            return false;
        },
        material(board, side) {
            return [...board].reduce((total, piece) => total + (this.side(piece) === side ? VALUES[piece.toLowerCase()] || 0 : 0), 0);
        },
        validState(state) {
            return state && typeof state.board === 'string' && /^[prnbqkPRNBQK.]{64}$/.test(state.board)
                && state.board.split('K').length === 2 && state.board.split('k').length === 2
                && Number.isInteger(state.serial) && state.serial >= 0 && Number.isInteger(state.revision) && state.revision >= 0
                && [state.credits, state.ack].every(values => Array.isArray(values) && values.length === 2 && values.every(Number.isInteger))
                && state.credits.every(value => value === 0 || value === 1) && state.ack.every(value => value >= 0)
                && Array.isArray(state.capturePoints) && state.capturePoints.length === 2 && state.capturePoints.every(value => Number.isInteger(value) && value >= 0 && value <= 999)
                && (state.castling === undefined || (Array.isArray(state.castling) && state.castling.length === 4 && state.castling.every(value => typeof value === 'boolean')))
                && (state.enPassant === undefined || (Number.isInteger(state.enPassant) && state.enPassant >= -1 && state.enPassant < 64))
                && [-2, -1, 0, 1].includes(state.winner);
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
                : { board: Rules.initial(), serial: 0, revision: 0, credits: [0, 0], ack: [0, 0], capturePoints: [0, 0], castling: [true, true, true, true], enPassant: -1, winner: -1, errors: ['', ''] };
            this.state.castling ||= [false, false, false, false];
            this.state.enPassant ??= -1;
            this.pending = null;
            this.botClock = 0;
            if (!s.preview) this.buildBoard();
            this.updateScore();
        }
        hint() { return 'Q: answer for one move · Drag or select a piece · Checkmate wins'; }
        touchHint() { return 'Answer for one move · Drag or tap a piece · Escape check before play resumes'; }
        touchLayout() { return { stick: false, buttons: [] }; }
        resourceNotice() {
            const notice = this.moveNotice ||= { label: 'Moves', value: 0 };
            notice.value = this.state.credits[this.side] || 0;
            return this.state.winner === -1 ? notice : null;
        }
        resourceWarningThreshold() { return 0; }
        goalText() { return this.state.winner === -2 ? 'Draw' : this.state.winner >= 0 ? 'Checkmate' : `${this.state.credits[this.side] || 0} move ready · ${this.side === 0 ? 'White' : 'Black'}`; }
        rankMetric(row) { return this.state.winner === -2 ? 0 : this.state.winner >= 0 && row.id === this.players[this.state.winner] ? 1000000 : row.g; }
        buildBoard() {
            const panel = document.createElement('section');
            panel.className = 'chess-panel';
            this.s.overlay.classList.toggle('mpg-chess', true);
            panel.innerHTML = `<p class="chess-status" role="status"></p><div class="chess-board" role="group" aria-label="Chess board"></div>
                <button type="button" class="primary-btn chess-question">Answer for a move</button>
                <p class="chess-rules">Answer correctly to earn one move. Either player can move when ready; while in check, only the checked player moves.</p>`;
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
            const previous = this.renderedBoard;
            const changed = previous ? [...state.board].map((piece, at) => piece !== previous[at] ? at : -1).filter(at => at >= 0) : [];
            if (changed.length) this.lastMove = changed;
            const checkedKings = [0, 1].filter(side => Rules.inCheck(state.board, side)).map(side => side === 0 ? 'K' : 'k');
            for (const square of this.squares) {
                const at = Number(square.dataset.square), piece = state.board[at];
                const rank = (this.side === 1 ? at % 8 === 7 : at % 8 === 0) ? String(8 - Math.floor(at / 8)) : '';
                if (square.dataset.piece !== piece) {
                    square.innerHTML = pieceMarkup(piece) + (rank ? `<span class="chess-rank">${rank}</span>` : '');
                    square.dataset.piece = piece;
                    const artwork = square.querySelector('.chess-piece');
                    const from = previous && piece !== '.' ? changed.find(index => previous[index] === piece && state.board[index] === '.') : undefined;
                    if (from !== undefined && artwork?.animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
                        const origin = this.squares.find(cell => Number(cell.dataset.square) === from);
                        const sourceRect = origin.getBoundingClientRect(), targetRect = square.getBoundingClientRect();
                        artwork.animate([{ transform: `translate(${sourceRect.left - targetRect.left}px, ${sourceRect.top - targetRect.top}px)` }, { transform: 'translate(0, 0)' }], { duration: 180, easing: 'ease-out' });
                    }
                }
                square.dataset.rank = rank;
                square.dataset.file = (this.side === 1 ? at < 8 : at >= 56) ? 'abcdefgh'[at % 8] : '';
                const label = `${'abcdefgh'[at % 8]}${8 - Math.floor(at / 8)}: ${piece === '.' ? 'empty' : `${Rules.side(piece) === 0 ? 'white' : 'black'} ${NAMES[piece.toLowerCase()]}`}`;
                square.setAttribute('aria-label', label);
                square.setAttribute('aria-pressed', String(this.selected === at));
                square.classList.toggle('selected', this.selected === at);
                square.classList.toggle('in-check', checkedKings.includes(piece));
                const legal = ready && this.selected >= 0 && Rules.legal(state.board, this.selected, at, this.side, state);
                square.classList.toggle('legal', legal && piece === '.');
                square.classList.toggle('capture', legal && piece !== '.');
                square.classList.toggle('last-move', Boolean(this.lastMove?.includes(at)));
            }
            this.renderedBoard = state.board;
            this.statusElement.textContent = state.winner === -2 ? 'Draw: no legal moves or only kings remain.' : state.winner >= 0 ? `${state.winner === 0 ? 'White' : 'Black'} wins by checkmate!`
                : this.pending ? 'Waiting for the host to confirm…'
                    : Rules.inCheck(state.board, this.side) ? `${this.side === 0 ? 'White' : 'Black'} is in check. ${ready ? 'Move to a safe square, block or capture the attacker.' : 'Answer for a move to escape.'}`
                        : Rules.inCheck(state.board, 1 - this.side) ? 'Opponent in check. Wait for their escape; you may prepare a move credit.'
                    : `${this.side === 0 ? 'White' : 'Black'} · ${ready ? 'Move ready: drag a piece or select its destination' : 'Answer a question to earn your next move'}`;
            this.panel.querySelector('.chess-question').disabled = ready || Boolean(this.pending) || state.winner !== -1 || this.s.over;
        }
        canMove() { return Boolean(this.state.credits[this.side]) && !Rules.inCheck(this.state.board, 1 - this.side) && !this.pending && !this.s.question && !this.s.paused && !this.s.over && this.s.countdown <= 0 && this.state.winner === -1; }
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
                if (this.canMove() && drag.revision === this.state.revision && Rules.legal(this.state.board, drag.from, to, this.side, this.state)) {
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
            if (this.s.question || this.s.paused || this.s.over || this.s.countdown > 0 || this.state.winner !== -1) return;
            if (!this.state.credits[this.side]) { this.recharge(); return; }
            if (this.pending) return;
            if (Rules.side(this.state.board[at]) === this.side) this.selected = at;
            else if (this.selected >= 0) {
                if (!Rules.legal(this.state.board, this.selected, at, this.side, this.state)) { this.s.toast('That move is unavailable. Escape check or wait for your opponent to escape.', '#fbbf24'); return; }
                this.request({ kind: 'move', from: this.selected, to: at, revision: this.state.revision });
                this.selected = -1;
            }
            this.renderBoard();
        }
        recharge() {
            if (this.s.preview || this.s.question || this.s.paused || this.s.over || this.s.countdown > 0 || this.pending || this.state.winner !== -1) return;
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
            if (!this.authority || side < 0 || !request || this.state.winner !== -1 || request.seq !== this.state.ack[side] + 1) return;
            if (request.kind === 'answer' && !this.s.cards.length) return;
            let error = '';
            if (request.kind === 'answer') {
                const card = Number.isInteger(request.cardIndex) ? this.s.cards[request.cardIndex] : null;
                if (!card || window.FlashcardTools.answerKey(request.answer) !== window.FlashcardTools.answerKey(card.back)) error = 'The answer did not earn a move.';
                else this.state.credits[side] = 1;
            } else if (request.kind === 'move') {
                const next = request.revision === this.state.revision && this.state.credits[side] === 1
                    ? Rules.move(this.state.board, request.from, request.to, side, this.state) : null;
                if (!next) error = 'The board changed or that move is invalid. Your move credit was kept; choose again.';
                else {
                    this.state.board = next.board;
                    this.state.castling = next.castling;
                    this.state.enPassant = next.enPassant;
                    this.state.capturePoints[side] += VALUES[next.captured.toLowerCase()] || 0;
                    this.lastMove = [request.from, request.to];
                    this.state.credits[side] = 0;
                    this.state.revision++;
                    if (!Rules.hasMove(this.state.board, 1 - side, this.state)) this.state.winner = Rules.inCheck(this.state.board, 1 - side) ? side : -2;
                    else if ([...this.state.board].every(piece => piece === '.' || piece.toLowerCase() === 'k')) this.state.winner = -2;
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
            this.finished = this.state.winner !== -1;
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
                        if (Rules.legal(this.state.board, from, to, opponent, this.state)) moves.push({ from, to, value: VALUES[this.state.board[to].toLowerCase()] || 0 });
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
            const background = ctx.createLinearGradient(0, 0, w, h);
            background.addColorStop(0, '#344a3c'); background.addColorStop(1, '#1d2b27');
            ctx.fillStyle = background; ctx.fillRect(0, 0, w, h);
            if (!this.s.preview) return;
            const size = Math.min(w, h) * .86, cell = size / 8, x = (w - size) / 2, y = (h - size) / 2;
            for (let at = 0; at < 64; at++) {
                ctx.fillStyle = (Math.floor(at / 8) + at % 8) % 2 ? '#779556' : '#ebecd0';
                ctx.fillRect(x + at % 8 * cell, y + Math.floor(at / 8) * cell, cell, cell);
                const piece = this.state.board[at];
                if (piece === '.') continue;
                const colors = PALETTE[Rules.side(piece)];
                ctx.save();
                ctx.translate(x + at % 8 * cell + cell * .075, y + Math.floor(at / 8) * cell + cell * .075);
                ctx.scale(cell * .85 / 64, cell * .85 / 64);
                ctx.fillStyle = colors.fill; ctx.strokeStyle = colors.stroke;
                ctx.lineWidth = 2.3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
                for (const d of [...SHAPES[piece.toLowerCase()], ...BASE]) {
                    const shape = previewPath(d); ctx.fill(shape); ctx.stroke(shape);
                }
                ctx.strokeStyle = colors.shine; ctx.lineWidth = 1.8; ctx.globalAlpha = .65;
                ctx.stroke(previewPath('M22 48h20M20 55h24'));
                ctx.restore();
            }
        }
    }
    A.ChessRules = Rules;
    A.games.chess = Chess;
})(window);
