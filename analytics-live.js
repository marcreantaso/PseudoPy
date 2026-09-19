/* Live analytics: snapshots online, stored records offline. No synthetic activity. */
function createAnalyticsFeed({ refs, read, listen, render, status, events = window }) {
    let active = true;
    let timer;
    const records = Object.fromEntries(refs.map(ref => [ref, read(ref)]));
    const sources = new Map();
    const stops = [];
    function flush() {
        if (!active) return;
        render(records);
        const live = refs.every(ref => sources.get(ref) === 'live');
        status(live ? 'Live updates' : 'Saved data · waiting for connection', live);
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(flush, 100); }
    refs.forEach(ref => {
        try {
            stops.push(listen(ref, (rows, fromCache) => {
                if (!active) return;
                records[ref] = rows;
                sources.set(ref, fromCache ? 'cache' : 'live');
                schedule();
            }, () => { sources.set(ref, 'cache'); schedule(); }));
        } catch (_) { sources.set(ref, 'cache'); }
    });
    function localChange(event) {
        const ref = event.detail?.ref;
        for (const key of refs) {
            if (ref && key !== ref) continue;
            records[key] = read(key);
        }
        schedule();
    }
    function offline() {
        refs.forEach(ref => sources.set(ref, 'cache'));
        schedule();
    }
    events.addEventListener('pseudopy:collection-change', localChange);
    events.addEventListener('storage', localChange);
    events.addEventListener('offline', offline);
    flush();
    return () => {
        active = false;
        clearTimeout(timer);
        stops.forEach(stop => { if (typeof stop === 'function') stop(); });
        events.removeEventListener('pseudopy:collection-change', localChange);
        events.removeEventListener('storage', localChange);
        events.removeEventListener('offline', offline);
    };
}

let stopAnalyticsFeed = null;
function stopAnalyticsRealtime() {
    if (stopAnalyticsFeed) stopAnalyticsFeed();
    stopAnalyticsFeed = null;
}
function startAnalyticsRealtime() {
    stopAnalyticsRealtime();
    stopAnalyticsFeed = createAnalyticsFeed({
        refs: [activityRef, usersRef, exercisesRef],
        read(ref) {
            try { return JSON.parse(localStorage.getItem(`pseudopy_local_${ref}`) || '[]'); }
            catch (_) { return []; }
        },
        listen(ref, next, error) {
            if (!firestoreReady()) return () => {};
            return firestore.collection(ref).onSnapshot({ includeMetadataChanges: true }, snapshot => {
                const rows = snapshot.docs.map(doc => ({ ...doc.data(), _docId: doc.id }));
                setLocalCollection(ref, rows);
                next(rows, snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites);
            }, error);
        },
        render(data) {
            if (currentUser && currentPage === 'analytics') loadAnalytics(data);
        },
        status(message, live) {
            const el = document.getElementById('analytics-sync-status');
            if (!el) return;
            el.textContent = message;
            el.dataset.live = String(live);
        }
    });
}
