// Optional AdSense settings. Leave unused IDs empty to keep banners collapsed.
window.STUDBUD_ADS = window.STUDBUD_ADS || {
    client: '', // ca-pub-XXXXXXXXXXXXXXXX
    slots: { home: '', decks: '', shop: '' }
};

(() => {
    'use strict';
    const placements = [...document.querySelectorAll('.ad-slot[data-ad-placement]')];
    let scriptPromise;
    let scheduled = false;
    const visible = element => Boolean(element && !element.hidden && element.getClientRects().length
        && getComputedStyle(element).visibility !== 'hidden');
    const blocked = () => navigator.onLine === false || window.StudBudCloud?.offlineMode
        || document.hidden || document.body.classList.contains('tutorial-active')
        || document.body.classList.contains('studying')
        || [...document.querySelectorAll('#auth-screen, #active-study-area, .mpg-overlay, .unbox-overlay, #modal-container, .user-profile-overlay, [role="dialog"]')].some(visible);
    const configured = slot => /^ca-pub-\d{16}$/.test(window.STUDBUD_ADS?.client || '')
        && /^\d+$/.test(window.STUDBUD_ADS?.slots?.[slot.dataset.adPlacement] || '');
    const allowed = slot => configured(slot) && !blocked()
        && Boolean(slot.closest('.view.active'));
    const inViewport = slot => {
        const rect = slot.getBoundingClientRect();
        return visible(slot) && rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight
            && rect.right > 0 && rect.left < window.innerWidth;
    };
    const loadScript = () => {
        if (!scriptPromise) {
            scriptPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.async = true;
                script.crossOrigin = 'anonymous';
                script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='
                    + encodeURIComponent(window.STUDBUD_ADS.client);
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
        return scriptPromise;
    };
    const requestAd = async slot => {
        if (slot.dataset.adRequested || !allowed(slot) || !inViewport(slot)) return;
        slot.dataset.adRequested = 'loading';
        try {
            await loadScript();
            // Navigation, a dialog, or going offline can happen while Google loads.
            if (!allowed(slot) || !inViewport(slot)) {
                delete slot.dataset.adRequested;
                return;
            }
            if (!slot.firstElementChild) {
                const label = document.createElement('small');
                label.className = 'ad-slot-label';
                label.textContent = 'Advertisements';
                const ad = document.createElement('ins');
                ad.className = 'adsbygoogle';
                ad.style.display = 'block';
                ad.dataset.adClient = window.STUDBUD_ADS.client;
                ad.dataset.adSlot = window.STUDBUD_ADS.slots[slot.dataset.adPlacement];
                ad.dataset.adFormat = 'horizontal';
                ad.dataset.fullWidthResponsive = 'false';
                slot.append(label, ad);
            }
            // AdSense rejects units with no available width; retry on the next layout change instead.
            const unit = slot.querySelector('ins.adsbygoogle');
            if (!(unit?.getBoundingClientRect().width > 0)) {
                delete slot.dataset.adRequested;
                return;
            }
            (window.adsbygoogle = window.adsbygoogle || []).push({});
            slot.dataset.adRequested = 'done';
        } catch (error) {
            console.warn('[Ads] Banner could not load:', error);
            slot.dataset.adRequested = 'failed';
            slot.hidden = true;
        }
    };
    const refresh = () => {
        scheduled = false;
        for (const slot of placements) {
            slot.hidden = !allowed(slot) || slot.dataset.adRequested === 'failed';
            if (slot.hidden) continue;
            requestAd(slot);
        }
    };
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(refresh);
    };
    // Observe app visibility changes, not Google's iframe contents or attributes.
    new MutationObserver(records => {
        if (records.some(record => !record.target.closest?.('.ad-slot'))) schedule();
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    if (window.IntersectionObserver) {
        const observer = new IntersectionObserver(schedule);
        placements.forEach(slot => observer.observe(slot));
    }
    ['online', 'offline', 'resize'].forEach(event => window.addEventListener(event, schedule));
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    document.addEventListener('visibilitychange', schedule);
    window.StudBudAds = { refresh };
    refresh();
})();
