(function (global) {
    'use strict';

    class ActiveStudyTracker {
        constructor({ save, onError, now = () => Date.now() }) {
            this.save = save;
            this.onError = onError;
            this.now = now;
            this.sessions = new Map();
            this.context = null;
            this.lastTick = now();
            this.lastActivity = now();
            this.available = true;
            this.queue = Promise.resolve();
        }

        tick() {
            const now = this.now();
            const elapsed = now - this.lastTick;
            const session = this.sessions.get(this.context?.key);
            // A suspended device or stalled event loop is not evidence of study.
            if (session && this.available && elapsed >= 0 && elapsed <= 5000) {
                session.milliseconds = Math.min(21600000, session.milliseconds
                    + Math.max(0, Math.min(now, this.lastActivity + 60000) - this.lastTick));
            }
            this.lastTick = now;
            if ([...this.sessions.values()].some(item => !item.queuedSeconds && (item.retry
                || Math.floor(item.milliseconds / 1000) - item.savedSeconds >= 15))) this.checkpoint();
        }

        activity() {
            this.tick();
            this.lastActivity = this.now();
        }

        setAvailable(available) {
            this.tick();
            this.available = available;
        }

        setContext(context) {
            this.tick();
            if (context?.key === this.context?.key) return;
            this.checkpoint();
            this.context = context;
            if (context && !this.sessions.has(context.key)) {
                this.sessions.set(context.key, {
                    ...context.session, id: context.key, autoTracked: true,
                    timestamp: new Date(this.now()).toISOString(),
                    milliseconds: 0, savedSeconds: 0, queuedSeconds: 0, retry: false
                });
            }
        }

        seconds(key = this.context?.key) {
            this.tick();
            return Math.floor((this.sessions.get(key)?.milliseconds || 0) / 1000);
        }

        get running() {
            return Boolean(this.context && this.available && this.now() - this.lastActivity < 60000
                && this.sessions.get(this.context.key)?.milliseconds < 21600000);
        }

        checkpoint() {
            for (const session of this.sessions.values()) this.saveCheckpoint(session);
            return this.queue;
        }

        saveCheckpoint(session) {
            const seconds = Math.min(21600, Math.floor(session.milliseconds / 1000));
            if (!seconds || seconds <= Math.max(session.savedSeconds, session.queuedSeconds)) return;
            session.queuedSeconds = seconds;
            const { milliseconds, savedSeconds, queuedSeconds, retry, ...record } = session;
            const persist = async () => {
                try {
                    await this.save({ ...record, durationSec: seconds });
                    session.savedSeconds = Math.max(session.savedSeconds, seconds);
                    session.retry = false;
                } catch (error) {
                    session.retry = true;
                    this.onError(error);
                } finally {
                    if (session.queuedSeconds === seconds) session.queuedSeconds = 0;
                }
            };
            this.queue = this.queue.then(persist);
        }

        stop(key = this.context?.key) {
            if (key === this.context?.key) this.setContext(null);
            return this.queue;
        }
    }

    global.ActiveStudyTracker = ActiveStudyTracker;
    if (typeof module !== 'undefined' && module.exports) module.exports = { ActiveStudyTracker };
})(typeof window !== 'undefined' ? window : globalThis);
