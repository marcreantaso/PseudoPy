/* ============================================================
   PSEUDOPY TOUR POSITIONING — pure viewport-aware geometry
   ------------------------------------------------------------
   Kept free of DOM so it can be unit-tested under Node. The
   browser bundle registers the same function as a global.
   ============================================================ */

function computeTourBubbleRect(viewport, target, placement, bubbleSize) {
    const gap = 12;
    const margin = Number.isFinite(viewport.margin) ? viewport.margin : 16;
    const safeTop = Number.isFinite(viewport.safeTop) ? viewport.safeTop : 0;
    const safeLeft = Number.isFinite(viewport.safeLeft) ? viewport.safeLeft : 0;
    const safeBottom = Number.isFinite(viewport.safeBottom) ? viewport.safeBottom : 0;
    const safeRight = Number.isFinite(viewport.safeRight) ? viewport.safeRight : 0;

    const limitW = Math.max(0, viewport.width - safeLeft - safeRight - margin * 2);
    const limitH = Math.max(0, viewport.height - safeTop - safeBottom - margin * 2);
    const width = Math.min(bubbleSize.width, limitW);
    const height = Math.min(bubbleSize.height, limitH);

    const minLeft = safeLeft + margin;
    const minTop = safeTop + margin;
    const maxLeft = viewport.width - safeRight - margin - width;
    const maxTop = viewport.height - safeBottom - margin - height;

    const targetLeft = target.left;
    const targetTop = target.top;
    const targetRight = Number.isFinite(target.right) ? target.right : target.left + target.width;
    const targetBottom = Number.isFinite(target.bottom) ? target.bottom : target.top + target.height;
    const targetWidth = Number.isFinite(target.width) ? target.width : targetRight - targetLeft;
    const targetHeight = Number.isFinite(target.height) ? target.height : targetBottom - targetTop;

    const clampX = x => Math.max(minLeft, Math.min(maxLeft, x));
    const clampY = y => Math.max(minTop, Math.min(maxTop, y));

    function fits(left, top) {
        return left >= minLeft && left + width <= viewport.width - safeRight - margin &&
               top >= minTop && top + height <= viewport.height - safeBottom - margin;
    }

    function candidate(place) {
        switch (place) {
            case 'above':
                return {
                    left: targetLeft + targetWidth / 2 - width / 2,
                    top: targetTop - gap - height,
                    placement: 'above'
                };
            case 'below':
                return {
                    left: targetLeft + targetWidth / 2 - width / 2,
                    top: targetBottom + gap,
                    placement: 'below'
                };
            case 'left':
                return {
                    left: targetLeft - gap - width,
                    top: targetTop + targetHeight / 2 - height / 2,
                    placement: 'left'
                };
            default:
                return {
                    left: targetRight + gap,
                    top: targetTop + targetHeight / 2 - height / 2,
                    placement: 'right'
                };
        }
    }

    const requested = candidate(placement);
    if (fits(requested.left, requested.top)) return rectOf(requested, width, height);

    const opposite = { above: 'below', below: 'above', left: 'right', right: 'left' };
    const flipped = candidate(opposite[placement] || 'below');
    if (fits(flipped.left, flipped.top)) return rectOf(flipped, width, height);

    const order = ['below', 'above', 'right', 'left'];
    for (const place of order) {
        const c = candidate(place);
        if (fits(c.left, c.top)) return rectOf(c, width, height);
    }

    return rectOf({ left: clampX(requested.left), top: clampY(requested.top), placement: requested.placement }, width, height);
}

function rectOf(c, width, height) {
    return {
        left: c.left,
        top: c.top,
        right: c.left + width,
        bottom: c.top + height,
        width,
        height,
        placement: c.placement
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { computeTourBubbleRect };
}