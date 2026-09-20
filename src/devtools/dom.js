function _esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function _setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}
