const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createTourModel } = require(path.join(__dirname, '..', 'src', 'learning', 'tour-model.js'));
const { TOUR_STEPS } = require(path.join(__dirname, '..', 'src', 'learning', 'tour-steps.js'));

test('starts on the first step', () => {
    const m = createTourModel(TOUR_STEPS);
    assert.equal(m.getIndex(), 0);
    assert.equal(m.current().targetId, TOUR_STEPS[0].targetId);
});

test('next() and prev() move within bounds', () => {
    const m = createTourModel(TOUR_STEPS);
    m.next();
    assert.equal(m.getIndex(), 1);
    m.next();
    assert.equal(m.getIndex(), 2);
    m.prev();
    assert.equal(m.getIndex(), 1);
});

test('next() clamps at the last step and reports isLast', () => {
    const m = createTourModel(TOUR_STEPS);
    m.go(TOUR_STEPS.length - 1);
    assert.equal(m.isLast(), true);
    m.next();
    assert.equal(m.getIndex(), TOUR_STEPS.length - 1);
});

test('prev() clamps at the first step and reports isFirst', () => {
    const m = createTourModel(TOUR_STEPS);
    m.prev();
    assert.equal(m.getIndex(), 0);
    assert.equal(m.isFirst(), true);
});

test('go() ignores out-of-range steps', () => {
    const m = createTourModel(TOUR_STEPS);
    m.go(-1);
    assert.equal(m.getIndex(), 0);
    m.go(TOUR_STEPS.length);
    assert.equal(m.getIndex(), 0);
    m.go(2);
    assert.equal(m.getIndex(), 2);
});

test('reset() returns to step zero', () => {
    const m = createTourModel(TOUR_STEPS);
    m.go(3);
    m.reset();
    assert.equal(m.getIndex(), 0);
});

test('every step declares a targetId and a supported placement', () => {
    const placements = ['above', 'below', 'left', 'right'];
    for (const step of TOUR_STEPS) {
        assert.ok(step.targetId && typeof step.targetId === 'string', 'targetId required');
        assert.ok(placements.includes(step.placement), `bad placement for ${step.targetId}`);
        assert.ok(typeof step.page === 'string', `page field required for ${step.targetId}`);
        assert.ok(step.title && step.text && step.icon, `content required for ${step.targetId}`);
    }
});

test('tour model is pure: no DOM globals referenced', () => {
    assert.equal(typeof window, 'undefined');
    assert.equal(typeof document, 'undefined');
    const m = createTourModel(TOUR_STEPS);
    assert.equal(m.length(), TOUR_STEPS.length);
});