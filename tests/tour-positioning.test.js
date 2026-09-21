const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { computeTourBubbleRect } = require(path.join(__dirname, '..', 'src', 'learning', 'tour-positioning.js'));

const vp = { width: 400, height: 600, margin: 16, safeTop: 0, safeLeft: 0, safeBottom: 0, safeRight: 0 };
const bubble = { width: 260, height: 120 };

function rectOf(l, t) {
    return { left: l, top: t, right: l + bubble.width, bottom: t + bubble.height };
}

test('below placement centers horizontally on target', () => {
    const target = { left: 100, top: 100, width: 200, height: 40 };
    const r = computeTourBubbleRect(vp, target, 'below', bubble);
    assert.deepEqual(r, { ...rectOf(70, 152), width: 260, height: 120, placement: 'below' });
});

test('above placement sits above target with gap', () => {
    const target = { left: 100, top: 300, width: 200, height: 40 };
    const r = computeTourBubbleRect(vp, target, 'above', bubble);
    assert.deepEqual(r, { ...rectOf(70, 168), width: 260, height: 120, placement: 'above' });
});

test('below near bottom flips to above so the bubble never clips', () => {
    const target = { left: 100, top: 500, width: 200, height: 40 };
    const r = computeTourBubbleRect(vp, target, 'below', bubble);
    assert.equal(r.placement, 'above');
    assert.ok(r.top >= 16 && r.bottom <= vp.height - 16);
});

test('above near top flips to below so the bubble never clips', () => {
    const target = { left: 100, top: 10, width: 200, height: 30 };
    const r = computeTourBubbleRect(vp, target, 'above', bubble);
    assert.equal(r.placement, 'below');
    assert.ok(r.top >= 16 && r.bottom <= vp.height - 16);
});

test('left placement near left edge flips to a fit or clamps into viewport', () => {
    const target = { left: 4, top: 200, width: 120, height: 40 };
    const r = computeTourBubbleRect(vp, target, 'left', bubble);
    assert.ok(r.left >= 16 && r.right <= vp.width - 16, 'bubble must stay inside the viewport');
});

test('target near the right edge clamps the bubble within the viewport', () => {
    const target = { left: 300, top: 100, width: 200, height: 40 }; // target.right == 500 > viewport
    const r = computeTourBubbleRect(vp, target, 'below', bubble);
    assert.ok(r.left >= 16 && r.right <= vp.width - 16);
});

test('bubble larger than the viewport is clamped to available width and height', () => {
    const tiny = { width: 200, height: 120, margin: 16, safeTop: 0, safeLeft: 0, safeBottom: 0, safeRight: 0 };
    const big = { width: 500, height: 300 };
    const r = computeTourBubbleRect(tiny, { left: 20, top: 20, width: 100, height: 40 }, 'below', big);
    assert.equal(r.width, 168); // 200 - 16*2
    assert.equal(r.height, 88); // 120 - 16*2
    assert.ok(r.left >= 16 && r.right <= 200 - 16);
});

test('safe-area bottom inset keeps the bubble clear of the gesture bar', () => {
    const vpWithInset = { ...vp, safeBottom: 34 };
    const target = { left: 100, top: 100, width: 200, height: 40 };
    const r = computeTourBubbleRect(vpWithInset, target, 'below', bubble);
    assert.ok(r.bottom <= vp.height - 16 - 34, 'must respect safe-bottom inset');
});

test('placement is always one of the four supported sides', () => {
    const target = { left: 100, top: 100, width: 200, height: 40 };
    for (const placement of ['above', 'below', 'left', 'right']) {
        const r = computeTourBubbleRect(vp, target, placement, bubble);
        assert.ok(['above', 'below', 'left', 'right'].includes(r.placement));
        assert.ok(r.top >= 16 && r.bottom <= vp.height - 16 && r.left >= 16 && r.right <= vp.width - 16);
    }
});