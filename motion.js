/* NUNSA editorial motion: headline letters fall into place; respects reduced motion. */
(() => {
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prepareHeadline = (headline) => {
    if (!headline || headline.dataset.lettersReady === 'true') return;
    const text = (headline.getAttribute('aria-label') || headline.textContent || '').trim();
    if (!text) return;
    headline.dataset.lettersReady = 'true';
    headline.setAttribute('aria-label', text);
    if (reduceMotion) return;
    headline.textContent = '';
    const fragment = document.createDocumentFragment();
    let index = 0;
    const words = text.split(/\s+/);
    words.forEach((word, wordIndex) => {
      const wordSpan = document.createElement('span');
      wordSpan.className = 'drop-word';
      wordSpan.setAttribute('aria-hidden', 'true');
      for (const char of word) {
        const letter = document.createElement('span');
        letter.className = 'drop-letter';
        letter.style.setProperty('--letter-delay', `${Math.min(index * 24, 520)}ms`);
        letter.textContent = char;
        wordSpan.appendChild(letter);
        index += 1;
      }
      fragment.appendChild(wordSpan);
      // Use a normal text-space so the browser can wrap between words on narrow screens.
      if (wordIndex < words.length - 1) fragment.appendChild(document.createTextNode(' '));
    });
    headline.appendChild(fragment);
  };
  const start = () => {
    document.querySelectorAll('.drop-headline').forEach(prepareHeadline);
    if (reduceMotion) return;
    const targets = document.querySelectorAll('[data-motion="rise"]:not(.page-intro)');
    targets.forEach((node, index) => {
      node.style.animationDelay = `${Math.min(index * 70, 280)}ms`;
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
