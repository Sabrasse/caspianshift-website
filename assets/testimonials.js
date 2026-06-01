// Shared testimonial data + DOM renderer used by index.html and funding.html.
// Single source of truth — update copy here and both pages stay in sync.
// Both pages already define the .testimonials-grid / .t-card / .t-badge styles
// in their own <style> blocks, so this file only ships data + DOM construction.

window.CS_TESTIMONIALS = [
  {
    tag: 'Funding',
    tagClass: '',
    quote: 'They helped us build a much stronger pitch and identify the right moment to approach publishers. A very productive and smooth collaboration from start to finish.',
    author: 'One More Turn Studio',
    game: 'Shattered Paradise',
    image: '/logo.png',
  },
  {
    tag: 'Marketing & PR',
    tagClass: 'orange',
    quote: 'The work done was great and very insightful. It helped us identify what was holding our game back and gave us a clear direction before our launch.',
    author: 'Jerfas Studio',
    game: "Homam: An Inventor's Fist",
  },
  {
    tag: 'Content Creation',
    tagClass: 'level-3',
    quote: 'They highlighted specific gaps on our Steam page we would have missed, and the feedback was practical enough to act on immediately.',
    author: 'Poisheesh',
    game: 'Cauldron Caution',
    image: '/cauldron_caution.jpg',
  },
];

// Build a detached .testimonials-grid element. Caller appends it where needed.
// opts.reveal=true adds the `reveal` class to each card so index.html's scroll
// observer can pick them up; funding.html doesn't use reveal so it omits the flag.
window.renderCsTestimonials = function (opts) {
  const reveal = !!(opts && opts.reveal);
  const grid = document.createElement('div');
  grid.className = 'testimonials-grid';
  for (const t of window.CS_TESTIMONIALS) {
    const card = document.createElement('div');
    card.className = 't-card'
      + (t.tagClass ? ' ' + t.tagClass : '')
      + (t.image ? ' has-cover' : '')
      + (reveal ? ' reveal' : '');

    if (t.image) {
      const cover = document.createElement('div');
      cover.className = 't-cover';
      cover.style.backgroundImage = 'url("' + t.image + '")';
      card.appendChild(cover);
    }

    const content = document.createElement('div');
    content.className = 't-content';

    const badge = document.createElement('span');
    badge.className = 't-badge' + (t.tagClass ? ' ' + t.tagClass : '');
    badge.textContent = t.tag;
    content.appendChild(badge);

    const big = document.createElement('div');
    big.className = 't-bigquote' + (t.tagClass ? ' ' + t.tagClass : '');
    big.textContent = '"';
    content.appendChild(big);

    const text = document.createElement('p');
    text.className = 't-text';
    text.textContent = t.quote;
    content.appendChild(text);

    const author = document.createElement('div');
    author.className = 't-author';
    author.textContent = t.author;
    content.appendChild(author);

    const game = document.createElement('div');
    game.className = 't-game';
    game.textContent = t.game;
    content.appendChild(game);

    card.appendChild(content);

    grid.appendChild(card);
  }
  return grid;
};
