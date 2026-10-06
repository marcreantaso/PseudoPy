/* UX Rule 4 — the primary action never moves between steps.
   Recovery steps 1-3 + success and the device-authorization modal must all
   share one footer geometry: secondary (Back/Cancel) left, primary right,
   identical structure in source order, 44px touch targets, reserved step
   height and safe-area padding. This is the automated structure half of the
   bounding-box acceptance check; live geometry at 375/1440 is the Playwright
   pass recorded in docs/qa/ux-audit-2026-10.md (Owner actions). */
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');

const ROOT=path.join(__dirname,'..');
// Normalise to LF once at load: the file is CRLF on a Windows checkout but LF
// in git and on Linux CI, and section() end-markers must not depend on that.
const index=fs.readFileSync(path.join(ROOT,'index.html'),'utf8').replace(/\r\n/g,'\n');
const css=fs.readFileSync(path.join(ROOT,'style.css'),'utf8').replace(/\r\n/g,'\n');

function section(startMarker,endMarker) {
    const start=index.indexOf(startMarker);
    assert.ok(start>-1,startMarker+' not found');
    const end=index.indexOf(endMarker,start);
    return index.slice(start,end>-1?end:undefined);
}

function extractFooters(html) {
    const footers=[];
    const re=/<div class="auth-flow-footer"[^>]*>([\s\S]*?)<\/div>/g;
    let m;
    while ((m=re.exec(html))!==null) footers.push(m[1]);
    return footers;
}

function buttonShape(footerHtml) {
    const buttons=[...footerHtml.matchAll(/<button class="btn ([^"]*)"/g)].map(m=>m[1].trim());
    return buttons;
}

test('each recovery step has exactly one footer: secondary left, primary right',()=>{
    for (const step of ['fp-step-1','fp-step-2','fp-step-3','fp-step-success']) {
        const html=section('id="'+step+'"', step==='fp-step-success'?'</div>\n        </div>\n      </div>':'<!-- '+(step==='fp-step-1'?'Step 2':step==='fp-step-2'?'Step 3':'Step Success'));
        const footers=extractFooters(html);
        assert.equal(footers.length,1,step+' has exactly one auth-flow-footer');
        const shape=buttonShape(footers[0]);
        assert.equal(shape.filter(c=>c.includes('btn-primary')).length,1,step+' has one primary button');
        const primaryIdx=shape.findIndex(c=>c.includes('btn-primary'));
        assert.equal(primaryIdx,shape.length-1,step+' primary is the last (rightmost) button');
        if (shape.length>1) {
            assert.equal(primaryIdx,1,step+' back/cancel action comes first (left)');
            assert.match(shape[0],/btn-(ghost|secondary)/,step+' back action is secondary-styled');
        }
        assert.match(footers[0],/Back to Sign In|Cancel/,step+' back wording is plain and consistent');
    }
});

test('the device-authorization modal uses the same footer geometry',()=>{
    const modal=section('id="new-device-pending-modal"','Archive Instructor Confirmation Modal');
    const footers=extractFooters(modal);
    assert.equal(footers.length,1,'device modal has one auth-flow-footer');
    const shape=buttonShape(footers[0]);
    assert.deepEqual(shape.map(c=>c.includes('btn-primary')?'primary':'secondary'),['secondary','primary'],'back left, primary right');
    assert.match(footers[0],/Back to Sign In/);
});

test('all flow buttons meet the 44px touch target and share one footer class',()=>{
    assert.match(css,/\.auth-flow-footer \{[\s\S]*?min-height: 44px/,'44px targets');
    const primaryRules=css.match(/\.auth-flow-footer \.btn-primary \{[\s\S]*?\}/);
    assert.ok(primaryRules,'primary rule exists');
    assert.match(primaryRules[0],/min-height: 44px/,'primary 44px target');
    assert.match(css,/env\(safe-area-inset-bottom/,'safe-area padding respected');
    assert.match(css,/position: sticky[\s\S]{0,80}bottom: 0/,'footer stays reachable on short screens');
});

test('steps reserve the tallest step so content changes never push the buttons',()=>{
    assert.match(css,/\.auth-step \{[\s\S]*?min-height/,'reserved step height');
    const steps=index.match(/class="auth-step[^"]*"/g)||[];
    assert.ok(steps.length>=4,'recovery steps and success share the auth-step reservation');
});

test('the exercise action bar keeps its fixed primary (regression guard)',()=>{
    const bar=section('id="exercise-action-bar"','Output Section');
    const order=[...bar.matchAll(/id="(btn-translate-pseudocode|btn-run-code|btn-submit-exercise)"/g)].map(m=>m[1]);
    assert.deepEqual(order,['btn-translate-pseudocode','btn-run-code','btn-submit-exercise'],'action bar order never re-renders away');
});
