(function (window) {
    'use strict';

    let pending = Promise.resolve();
    function request(message, initialValue) {
        const result = pending.then(() => new Promise(resolve => {
            const previous = document.activeElement;
            const dialog = document.createElement('dialog');
            dialog.className = 'app-confirmation';
            const form = document.createElement('form');
            form.method = 'dialog';
            const title = document.createElement('h2');
            title.id = 'app-confirmation-title';
            title.textContent = initialValue === undefined ? 'Confirm action' : 'Enter details';
            dialog.setAttribute('aria-labelledby', title.id);
            const text = document.createElement('p');
            text.id = 'app-confirmation-message';
            text.textContent = message;
            dialog.setAttribute('aria-describedby', text.id);
            form.append(title, text);
            let input;
            if (initialValue !== undefined) {
                input = document.createElement('input');
                input.type = 'text';
                input.value = initialValue;
                input.setAttribute('aria-label', message);
                form.append(input);
            }
            const actions = document.createElement('div');
            actions.className = 'app-confirmation-actions';
            for (const [value, label, className] of [['cancel', 'Cancel', 'secondary-btn'], ['confirm', 'Continue', 'primary-btn']]) {
                const button = document.createElement('button');
                button.type = 'submit'; button.value = value;
                button.textContent = label; button.className = className;
                actions.append(button);
            }
            form.append(actions); dialog.append(form);
            // Append inside an active editor so its inert background does not disable the confirmation.
            const overlay = document.getElementById('modal-container');
            (overlay && !overlay.classList.contains('hidden') ? overlay : document.body).append(dialog);
            let settled = false;
            const finish = accepted => {
                if (settled) return;
                settled = true;
                const value = input ? accepted ? input.value : null : accepted;
                dialog.close(accepted ? 'confirm' : 'cancel');
                dialog.remove();
                if (previous?.isConnected) previous.focus({ preventScroll: true });
                resolve(value);
            };
            form.addEventListener('submit', event => {
                event.preventDefault();
                finish(event.submitter?.value === 'confirm');
            });
            dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
            dialog.addEventListener('keydown', event => { event.stopPropagation(); });
            dialog.addEventListener('close', () => finish(dialog.returnValue === 'confirm'), { once: true });
            dialog.showModal();
            (input || actions.firstElementChild).focus();
        }));
        pending = result.then(() => undefined);
        return result;
    }

    window.StudBudDialogs = {
        confirm: message => request(message),
        prompt: (message, initialValue = '') => request(message, initialValue),
        notify(message) {
            let notice = document.getElementById('app-notice');
            if (!notice) {
                notice = document.createElement('aside');
                notice.id = 'app-notice'; notice.className = 'app-notice';
                notice.setAttribute('role', 'status');
                const text = document.createElement('p');
                const dismiss = document.createElement('button');
                dismiss.type = 'button'; dismiss.className = 'secondary-btn';
                dismiss.textContent = 'Dismiss';
                dismiss.addEventListener('click', () => { notice.hidden = true; });
                notice.append(text, dismiss);
                document.body.append(notice);
            }
            notice.firstElementChild.textContent = message;
            notice.hidden = false;
        }
    };
})(window);
