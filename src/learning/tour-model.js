/* ============================================================
   TOUR MODEL — pure step progression (no DOM, no state, no I/O)
   The controller keeps one model instance per tutorial run so all
   boundary/skip logic is testable under Node.
   ============================================================ */

function createTourModel(steps) {
    const list = Array.isArray(steps) ? steps : [];
    let index = 0;

    return {
        get steps() { return list; },
        getIndex() { return index; },
        current() { return list[index] || null; },
        prev() { index = Math.max(0, index - 1); return this.current(); },
        next() { index = Math.min(list.length - 1, index + 1); return this.current(); },
        go(i) {
            const n = Number(i);
            if (Number.isFinite(n) && n >= 0 && n < list.length) index = n;
            return this.current();
        },
        reset() { index = 0; return this.current(); },
        isFirst() { return index === 0; },
        isLast() { return index === list.length - 1; },
        length() { return list.length; }
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createTourModel };
}