/* ============================================================
   ON-DEMAND THIRD-PARTY LIBRARY LOADING
   Heavy libraries (Skulpt, PDF.js, anime, lucide) are no longer
   loaded at page start. They download on first use so the app
   shell, login and navigation render without waiting on CDNs.
   ============================================================ */

const CDN_BASE_URLS = {
    lucide: 'https://cdn.jsdelivr.net/npm/lucide@0.468.0/dist/umd/lucide.js',
    skulpt: ['https://skulpt.org/js/skulpt.min.js', 'https://skulpt.org/js/skulpt-stdlib.js'],
    pdfjs: ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'],
    anime: ['https://cdn.jsdelivr.net/npm/animejs@4.5.0/dist/bundles/anime.umd.min.js']
};

function loadScripts(srcList, onSuccess, onError) {
    if (!srcList || !srcList.length) { if (onSuccess) onSuccess(); return; }
    let index = 0;
    function next() {
        if (index >= srcList.length) {
            if (onSuccess) onSuccess();
            return;
        }
        const s = document.createElement('script');
        s.src = srcList[index++] + '?v=on-demand';
        s.async = true;
        s.onload = next;
        s.onerror = function () {
            if (onError) onError(new Error('Failed to load script: ' + s.src));
        };
        document.head.appendChild(s);
    }
    next();
}