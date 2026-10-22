(function () {
    'use strict';

    const selector = [
        'select[data-ic-class]', 'select[data-deck-link="course"]', 'select[data-deck-course-select]',
        'select[name="courseCode"]', '#assignment-course', '#assignment-course-filter',
        '#analytics-course-select', '#deck-editor-course', '#community-class'
    ].join(',');
    const controls = new WeakMap();
    let active = null;
    let nextID = 0;

    function close(restoreFocus = false) {
        if (!active) return;
        const { panel, button } = active;
        active = null;
        panel.remove();
        button.setAttribute('aria-expanded', 'false');
        button.removeAttribute('aria-controls');
        if (restoreFocus && button.isConnected) button.focus();
    }

    function refresh(select) {
        const control = controls.get(select);
        if (!control) return;
        const label = select.getAttribute('aria-label') || [...select.labels || []]
            .map(item => [...item.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join(' ').trim())
            .filter(Boolean).join(' ') || 'Class';
        const text = select.selectedOptions[0]?.textContent || 'Choose a class';
        if (control.button.textContent !== text) control.button.textContent = text;
        control.button.setAttribute('aria-label', `${label}: ${text}`);
        control.button.disabled = select.disabled;
        control.label = label;
    }

    function position() {
        if (!active) return;
        const { button, panel } = active;
        const rect = button.getBoundingClientRect();
        const width = Math.min(Math.max(rect.width, 300), innerWidth - 24);
        panel.style.width = `${width}px`;
        panel.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - width - 12))}px`;
        const below = innerHeight - rect.bottom - 12;
        const above = rect.top - 12;
        const upward = below < 240 && above > below;
        panel.style.maxHeight = `${Math.max(100, Math.min(360, upward ? above : below))}px`;
        panel.style.top = upward ? 'auto' : `${rect.bottom + 4}px`;
        panel.style.bottom = upward ? `${innerHeight - rect.top + 4}px` : 'auto';
    }

    function open(select) {
        close();
        if (select.disabled) return;
        refresh(select);
        const { button, wrapper, label } = controls.get(select);
        const panel = document.createElement('div');
        panel.id = `class-search-panel-${++nextID}`;
        panel.className = 'class-search-panel';
        panel.setAttribute('popover', 'manual');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', `Choose ${label}`);
        const input = document.createElement('input');
        input.type = 'search';
        input.placeholder = 'Search class name or code';
        input.autocomplete = 'off';
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-label', `Search ${label}`);
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'true');
        const list = document.createElement('div');
        list.className = 'class-search-options';
        list.id = `class-search-options-${++nextID}`;
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-label', label);
        input.setAttribute('aria-controls', list.id);
        const status = document.createElement('small');
        status.setAttribute('role', 'status');
        panel.append(input, status, list);
        wrapper.append(panel);
        if (panel.showPopover) panel.showPopover();
        else document.body.append(panel);
        active = { select, button, panel };
        button.setAttribute('aria-expanded', 'true');
        button.setAttribute('aria-controls', panel.id);
        let matches = [];
        let index = -1;
        function highlight(next) {
            index = next;
            [...list.children].forEach((option, i) => option.classList.toggle('active', i === index));
            if (list.children[index]) {
                input.setAttribute('aria-activedescendant', list.children[index].id);
                list.children[index].scrollIntoView({ block: 'nearest' });
            } else input.removeAttribute('aria-activedescendant');
        }
        function choose(option) {
            select.value = option.value;
            refresh(select);
            close(true);
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        function filter() {
            const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
            matches = [...select.options].filter(option => !option.disabled && !option.hidden
                && !option.parentElement.disabled && words.every(word =>
                    `${option.textContent} ${option.value} ${option.parentElement.label || ''}`.toLowerCase().includes(word)));
            list.replaceChildren();
            status.textContent = matches.length ? `${matches.length} choices` : 'No matching classes';
            let group = '';
            matches.forEach((option, i) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.tabIndex = -1;
                item.id = `${list.id}-${i}`;
                item.setAttribute('role', 'option');
                item.setAttribute('aria-selected', String(option.selected));
                const groupLabel = option.parentElement.tagName === 'OPTGROUP' ? option.parentElement.label : '';
                if (groupLabel && groupLabel !== group) {
                    const heading = document.createElement('small');
                    heading.textContent = groupLabel;
                    item.append(heading);
                }
                group = groupLabel;
                item.append(document.createTextNode(option.textContent));
                item.addEventListener('click', () => choose(option));
                list.append(item);
            });
            highlight(matches.findIndex(option => option.selected));
        }
        input.addEventListener('input', filter);
        input.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                event.stopPropagation();
                if (matches.length) highlight((index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
            } else if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                if (matches[index] || matches.length === 1) choose(matches[index] || matches[0]);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close(true);
            } else if (event.key === 'Tab') close(true);
        });
        filter();
        position();
        input.focus();
    }

    function enhance(select) {
        if (controls.has(select)) { refresh(select); return; }
        const wrapper = document.createElement('span');
        wrapper.className = 'class-search-control';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'class-search-toggle';
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-expanded', 'false');
        controls.set(select, { wrapper, button });
        select.parentNode.insertBefore(wrapper, select);
        wrapper.append(select, button);
        select.classList.add('class-search-native');
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');
        select.addEventListener('focus', () => { refresh(select); button.focus(); });
        select.addEventListener('invalid', event => { event.preventDefault(); open(select); });
        select.addEventListener('change', () => refresh(select));
        button.addEventListener('click', () => active?.select === select ? close() : open(select));
        refresh(select);
    }

    function scan(node) {
        if (node.nodeType !== 1) return;
        if (node.matches(selector)) enhance(node);
        node.querySelectorAll(selector).forEach(enhance);
    }
    const observer = new MutationObserver(records => {
        if (active && (!active.select.isConnected || active.select.disabled)) close();
        records.forEach(record => {
            const select = record.target.closest?.('select');
            if (select && controls.has(select)) {
                refresh(select);
                if (active?.select === select) close();
            }
            record.addedNodes.forEach(scan);
        });
    });
    document.querySelectorAll(selector).forEach(enhance);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'label', 'selected'] });
    document.addEventListener('pointerdown', event => {
        if (active && !active.panel.contains(event.target) && !active.button.contains(event.target)) close();
    }, true);
    document.addEventListener('focusin', event => {
        if (active && !active.panel.contains(event.target) && event.target !== active.button) close();
    });
    document.addEventListener('scroll', event => {
        if (active && !active.panel.contains(event.target)) position();
    }, true);
    window.addEventListener('resize', position);
})();
