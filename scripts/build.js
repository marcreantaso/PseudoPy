const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const bundles = require('../src/bundles.json');

/** Ordered classic-script modules preserve the existing HTML handler contract. */
function build({ check = false } = {}) {
    const outputs = Object.entries(bundles).map(([target, sources]) => {
        const content = sources.map(source => {
            const text = fs.readFileSync(path.join(root, source), 'utf8');
            new vm.Script(text, { filename: source });
            return text;
        }).join('');
        new vm.Script(content, { filename: target });
        return { target, content };
    });
    // Validate every module before writing any output.
    for (const { target, content } of outputs) {
        const filename = path.join(root, target);
        if (check) {
            if (!fs.existsSync(filename) || fs.readFileSync(filename, 'utf8') !== content) {
                throw new Error(`${target} is stale. Run npm run build and commit the generated bundles.`);
            }
        } else {
            fs.writeFileSync(filename, content);
        }
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
