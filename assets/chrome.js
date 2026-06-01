// Shared nav + footer partial. Both index.html and funding.html drop in
// `<div data-cs-nav></div>` and `<div data-cs-footer></div>` placeholders;
// this script replaces them with the real chrome on page load.
//
// Loaded with `defer` so it runs after the HTML is parsed but before
// DOMContentLoaded, which keeps the gap before the chrome appears tiny.
(function () {
  'use strict';

  // Compass logo — reused by the nav and the footer.
  var COMPASS_SVG = ''
    + '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    +   '<circle cx="12" cy="12" r="10" stroke="#17BEBB" stroke-width="1.5"/>'
    +   '<circle cx="12" cy="12" r="2" fill="#17BEBB"/>'
    +   '<polygon points="12,3 10.5,12 13.5,12" fill="#17BEBB"/>'
    +   '<polygon points="12,21 13.5,12 10.5,12" fill="#FC7A1E"/>'
    +   '<line x1="12" y1="2" x2="12" y2="4.5" stroke="#17BEBB" stroke-width="1.2"/>'
    +   '<line x1="12" y1="19.5" x2="12" y2="22" stroke="#17BEBB" stroke-width="1.2"/>'
    +   '<line x1="2" y1="12" x2="4.5" y2="12" stroke="#17BEBB" stroke-width="1.2"/>'
    +   '<line x1="19.5" y1="12" x2="22" y2="12" stroke="#17BEBB" stroke-width="1.2"/>'
    + '</svg>';

  function buildNav() {
    var nav = document.createElement('nav');
    nav.id = 'cs-nav';
    nav.innerHTML = ''
      + '<div class="nav-left">'
      +   '<a href="/" class="nav-logo">' + COMPASS_SVG + 'Caspian Shift</a>'
      +   '<a href="/funding" class="nav-link">Funding Analysis<span class="nav-link-tag">Tool</span></a>'
      +   '<a href="/matcher" class="nav-link">Creator Matcher<span class="nav-link-tag nav-link-tag-orange">Tool</span></a>'
      + '</div>'
      + '<div class="nav-right">'
      +   '<a href="/#contact" class="btn-pill">Get in Touch</a>'
      + '</div>';
    return nav;
  }

  function buildFooter() {
    var foot = document.createElement('footer');
    foot.innerHTML = ''
      + '<a href="/" class="nav-logo">' + COMPASS_SVG + 'Caspian Shift</a>'
      + '<span class="footer-copy">© 2026 Caspian Shift. All rights reserved.</span>'
      + '<a href="/#contact" class="footer-link">Get in touch</a>';
    return foot;
  }

  // Clicking the logo on the page you're already on used to scroll to top
  // (because the markup used `href="#"`). Preserve that UX even though the
  // partial points to `/` so the cross-page navigation still works.
  function wireLogoSelfClick(root) {
    root.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a.nav-logo');
      if (!a) return;
      var url;
      try { url = new URL(a.href, location.href); } catch (_) { return; }
      if (url.pathname === location.pathname && !url.hash) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  // Tag the nav anchor that matches the current page with `.active` so the
  // CSS can highlight it. We only mark the logo and the secondary nav-link —
  // the "Get in Touch" btn-pill is intentionally excluded so it stays a CTA.
  function markActiveNavLink(navEl) {
    var path = location.pathname;
    var anchors = navEl.querySelectorAll('a.nav-logo, a.nav-link');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href;
      try { href = new URL(a.href, location.href).pathname; } catch (_) { continue; }
      var isActive = false;
      if (href === '/' && path === '/') isActive = true;
      else if (href !== '/' && path.indexOf(href) === 0) isActive = true;
      if (isActive) a.classList.add('active');
    }
  }

  function mount() {
    var navMount = document.querySelector('[data-cs-nav]');
    if (navMount) {
      var nav = buildNav();
      navMount.replaceWith(nav);
      wireLogoSelfClick(nav);
      markActiveNavLink(nav);
      var onScroll = function () {
        if (window.scrollY > 20) nav.classList.add('scrolled');
        else nav.classList.remove('scrolled');
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    var footMount = document.querySelector('[data-cs-footer]');
    if (footMount) {
      var foot = buildFooter();
      footMount.replaceWith(foot);
      wireLogoSelfClick(foot);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
