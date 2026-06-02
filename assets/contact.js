// Shared contact section — used by index.html and funding.html.
// Renders the full "Get in touch / Ready to shift course?" section as a DOM tree:
// label, title, K+V avatar row, role, intro paragraph, email + multi-select form, success ack.
//
// Default mount: drop <div data-cs-contact></div> into the page and this file
// replaces it on load. For pages needing extra context (e.g. /funding passes
// `game` and `notionPageId` as hidden inputs, and supplies avatar URLs since
// it has no #about section to clone from), call `window.renderCsContact(opts)`
// directly and append the returned node.
(function () {
  'use strict';

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return el;
  }

  // Chips-in-input multi-select, mirrors the /funding step-2 picker.
  function mountMultiSelect(host, hidden) {
    const options = (host.dataset.options || '').split(',').map(s => s.trim()).filter(Boolean);
    const placeholder = host.dataset.placeholder || 'Search…';
    let selected = [];
    let open = false;
    let filter = '';
    let highlighted = 0;
    let inputEl;
    let menuEl;

    function syncHidden() { hidden.value = selected.join(', '); }
    function filteredOptions() {
      const f = filter.trim().toLowerCase();
      const sel = new Set(selected);
      return options.filter(o => !sel.has(o) && (!f || o.toLowerCase().includes(f)));
    }
    function addChip(o) {
      selected = [...selected, o];
      syncHidden();
      filter = ''; highlighted = 0; open = true;
      render();
      if (inputEl) inputEl.focus();
    }
    function removeChip(o) {
      selected = selected.filter(v => v !== o);
      syncHidden();
      highlighted = 0;
      render();
      if (inputEl) inputEl.focus();
    }

    function buildField() {
      const f = document.createElement('div');
      f.className = 'cs-mss-field' + (open ? ' open' : '');
      selected.forEach(o => {
        const chip = document.createElement('span');
        chip.className = 'cs-mss-chip';
        const label = document.createElement('span');
        label.textContent = o;
        chip.appendChild(label);
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'cs-mss-x';
        x.tabIndex = -1;
        x.textContent = '×';
        x.addEventListener('mousedown', (e) => e.preventDefault());
        x.addEventListener('click', (e) => { e.stopPropagation(); removeChip(o); });
        chip.appendChild(x);
        f.appendChild(chip);
      });
      inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.className = 'cs-mss-input';
      inputEl.autocomplete = 'off';
      inputEl.placeholder = selected.length ? '' : placeholder;
      inputEl.value = filter;
      inputEl.addEventListener('focus', () => {
        if (!open) { open = true; f.classList.add('open'); renderMenu(); }
      });
      inputEl.addEventListener('input', (e) => {
        filter = e.target.value;
        highlighted = 0;
        open = true;
        f.classList.add('open');
        renderMenu();
      });
      inputEl.addEventListener('keydown', (e) => {
        const opts = filteredOptions();
        if (e.key === 'Backspace' && !filter && selected.length) {
          e.preventDefault();
          removeChip(selected[selected.length - 1]);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (!open) { open = true; f.classList.add('open'); renderMenu(); return; }
          highlighted = Math.min(opts.length - 1, highlighted + 1);
          renderMenu();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          highlighted = Math.max(0, highlighted - 1);
          renderMenu();
        } else if (e.key === 'Enter') {
          if (open && opts[highlighted]) { e.preventDefault(); addChip(opts[highlighted]); }
        } else if (e.key === 'Escape') {
          open = false; f.classList.remove('open'); renderMenu();
        }
      });
      f.appendChild(inputEl);
      f.addEventListener('mousedown', (e) => {
        if (e.target === f) { e.preventDefault(); if (inputEl) inputEl.focus(); }
      });
      return f;
    }

    function buildMenu() {
      const opts = filteredOptions();
      const m = document.createElement('div');
      m.className = 'cs-mss-menu';
      if (!opts.length) {
        const empty = document.createElement('div');
        empty.className = 'cs-mss-empty';
        empty.textContent = filter ? 'No matches' : 'All options selected';
        m.appendChild(empty);
        return m;
      }
      opts.forEach((o, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cs-mss-option' + (i === highlighted ? ' active' : '');
        b.textContent = o;
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => addChip(o));
        m.appendChild(b);
      });
      return m;
    }
    function renderMenu() {
      if (menuEl) { menuEl.remove(); menuEl = null; }
      if (open) { menuEl = buildMenu(); host.appendChild(menuEl); }
    }
    function render() {
      host.innerHTML = '';
      menuEl = null;
      host.appendChild(buildField());
      renderMenu();
    }
    render();

    document.addEventListener('mousedown', (e) => {
      if (!host.isConnected) return;
      if (open && !host.contains(e.target)) {
        open = false;
        const f = host.querySelector('.cs-mss-field');
        if (f) f.classList.remove('open');
        renderMenu();
      }
    });
  }

  window.renderCsContact = function (opts) {
    opts = opts || {};
    const hiddenFields = opts.hiddenFields || {};
    const avatars = opts.avatars || {};
    const copy = opts.copy || {};
    const title = copy.title || 'Ready to shift course?';
    const introLead = copy.introLead || 'We offer the kind of business support a publisher would, ';
    const introEmphasis = copy.introEmphasis || 'without the constraints.';

    const avatarKeyvanStyle = avatars.keyvan ? `background-image:url('${avatars.keyvan}');` : null;
    const avatarVanilleStyle = avatars.vanille ? `background-image:url('${avatars.vanille}');` : null;

    const root = h('div', { class: 'section-wrap', id: 'contact' },
      h('span', { class: 'section-label', style: 'display:block;text-align:center;' }, 'Get in touch'),
      h('h2', { class: 'section-title reveal' }, title),
      h('div', { class: 'cs-about-avatars reveal', 'aria-hidden': 'true' },
        h('div', {
          class: 'cs-about-avatar',
          'data-cs-avatar': 'keyvan',
          style: avatarKeyvanStyle,
        }, 'K'),
        h('div', {
          class: 'cs-about-avatar orange',
          'data-cs-avatar': 'vanille',
          style: avatarVanilleStyle,
        }, 'V'),
      ),
      h('div', { class: 'cs-about-role reveal' }, 'Caspian Shift'),
      h('p', {
        class: 'cs-contact-placeholder reveal',
        style: 'text-align:center;max-width:560px;margin:0 auto 2rem;color:var(--white);font-size:.95rem;line-height:1.6;',
      },
        introLead,
        h('span', { style: 'color:var(--cream);' }, introEmphasis),
      ),
    );

    const form = h('form', {
      class: 'contact-form reveal',
      name: 'contact',
      method: 'POST',
      'data-netlify': 'true',
      'netlify-honeypot': 'bot-field',
    },
      h('input', { type: 'hidden', name: 'form-name', value: 'contact' }),
      h('p', { style: 'display:none;' },
        h('label', null, "Don't fill this out: ", h('input', { name: 'bot-field' }))),
    );
    for (const name in hiddenFields) {
      form.appendChild(h('input', { type: 'hidden', name, value: hiddenFields[name] }));
    }

    form.appendChild(
      h('div', { class: 'form-group' },
        h('label', { for: 'cs-contact-email' }, 'Your Email'),
        h('input', { type: 'email', id: 'cs-contact-email', name: 'email', placeholder: 'hello@studio.com', required: true }),
      )
    );

    const mssHost = h('div', {
      class: 'cs-mss',
      'data-options': 'Funding Scouting,Marketing & PR,Content Creation',
      'data-placeholder': 'Pick one or more…',
    });
    const mssHidden = h('input', { type: 'hidden', id: 'cs-contact-service', name: 'service', value: '' });
    form.appendChild(
      h('div', { class: 'form-group' },
        h('label', { for: 'cs-contact-service' },
          "What you're looking for ",
          h('span', { style: "font-family:'Nunito',sans-serif;font-size:.75rem;opacity:.45;letter-spacing:0;" }, 'optional')
        ),
        mssHost,
        mssHidden,
      )
    );

    form.appendChild(
      h('button', {
        type: 'submit',
        class: 'btn-pill',
        style: 'display:block;width:30%;margin:0 auto;font-size:1.1rem;padding:.85rem;border-radius:999px;justify-content:center;',
      }, 'Get in Touch')
    );

    const success = h('div', { style: 'display:none;text-align:center;padding:3rem 1rem;' },
      h('div', { style: 'font-size:2.5rem;margin-bottom:1rem;' }, '🧭'),
      h('h3', { style: "font-family:'Boogaloo',cursive;font-size:2rem;color:var(--teal);margin-bottom:.75rem;" }, 'Message received!'),
      h('p', { style: 'color:var(--white);font-size:1rem;line-height:1.7;' },
        "We'll be in touch shortly.",
        h('br'),
        'In the meantime, feel free to explore the rest of the page.',
      )
    );

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      try {
        await fetch('/', { method: 'POST', body: data });
      } catch (_) { /* Netlify queues retries; show ack regardless so we never block the user. */ }
      form.style.display = 'none';
      success.style.display = 'block';
    });

    root.appendChild(form);
    root.appendChild(success);

    mountMultiSelect(mssHost, mssHidden);

    return root;
  };

  // Auto-mount placeholders already in the DOM. Funding's results page calls
  // renderCsContact() directly with options, so it won't hit this path.
  function autoMount() {
    document.querySelectorAll('[data-cs-contact]').forEach((host) => {
      if (host.dataset.csContactMounted) return;
      host.dataset.csContactMounted = '1';
      host.replaceWith(window.renderCsContact());
    });
  }
  autoMount();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  }
})();
