const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const bundles = require('../src/bundles.json');
const VERSION_PLACEHOLDER = '__PSEUDOPY_VERSION__';

/** Ordered classic-script modules preserve the existing HTML handler contract. */
function build({ check = false } = {}) {
    const packageVersion = JSON.parse(
        fs.readFileSync(path.join(root, 'package.json'), 'utf8')
    ).version;
    const outputs = Object.entries(bundles).map(([target, sources]) => {
        let content = sources.map(source => {
            const text = fs.readFileSync(path.join(root, source), 'utf8');
            new vm.Script(text, { filename: source });
            // Concatenated modules share one script, so guarantee a statement
            // boundary: a module that does not end in a newline would otherwise
            // glue onto the next one (automatic semicolon insertion hazard).
            return text.endsWith('\n') ? text : text + '\n';
        }).join('');
        // Inject the source-of-truth app version (package.json) into the main
        // bundle so it is never hardcoded across the app. At least one
        // placeholder must exist: zero means version injection was silently
        // removed from every source.
        if (target === 'app.js') {
            const placeholders = content.split(VERSION_PLACEHOLDER).length - 1;
            if (placeholders < 1) {
                throw new Error(
                    `${target} contains no ${VERSION_PLACEHOLDER} placeholder; version injection was removed.`
                );
            }
            content = content.split(VERSION_PLACEHOLDER).join(packageVersion);
        }
        new vm.Script(content, { filename: target });
        return { target, content };
    });
    // Validate every module before writing any output.
    const stale = [];
    for (const { target, content } of outputs) {
        const filename = path.join(root, target);
        if (check) {
            if (!fs.existsSync(filename) || fs.readFileSync(filename, 'utf8') !== content) {
                stale.push(target);
            }
        } else {
            // Write through a temp file and rename so a crash cannot leave a
            // half-written bundle that later gets committed.
            const tmp = `${filename}.tmp`;
            fs.writeFileSync(tmp, content);
            fs.renameSync(tmp, filename);
        }
    }
    if (stale.length) {
        throw new Error(`${stale.join(', ')} ${stale.length === 1 ? 'is' : 'are'} stale. Run npm run build and commit the generated bundles.`);
    }
    return outputs.map(({ target }) => target);
}

if (require.main === module) {
    try {
        const check = process.argv.includes('--check');
        console.log(`${check ? 'Verified' : 'Built'}: ${build({ check }).join(', ')}`);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { build };
