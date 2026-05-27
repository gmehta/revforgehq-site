/* ─── Nav scroll behavior ─────────────────────────────────────────────────── */
const nav = document.getElementById('nav');

const onScroll = () => {
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 10);
};

window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ─── Capabilities dropdown (desktop) ─────────────────────────────────────── */
document.querySelectorAll('.nav-has-dropdown').forEach((item) => {
  const trigger = item.querySelector('.nav-dropdown-trigger');
  const panel = item.querySelector('.nav-dropdown-panel');
  if (!trigger) return;

  let closeTimer;

  const open = () => {
    clearTimeout(closeTimer);
    item.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  };

  const scheduleClose = () => {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      item.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }, 120);
  };

  item.addEventListener('mouseenter', open);
  item.addEventListener('mouseleave', scheduleClose);

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (item.classList.contains('open')) {
      item.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    } else {
      open();
    }
  });

  panel?.addEventListener('click', (e) => e.stopPropagation());
});

document.addEventListener('click', () => {
  document.querySelectorAll('.nav-has-dropdown.open').forEach((item) => {
    item.classList.remove('open');
    item.querySelector('.nav-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.nav-has-dropdown.open').forEach((item) => {
    item.classList.remove('open');
    item.querySelector('.nav-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
  });
});

/* ─── Mobile menu toggle ──────────────────────────────────────────────────── */
const toggle = document.querySelector('.nav-toggle');
const mobileMenu = document.getElementById('nav-mobile');

if (toggle && mobileMenu) {
  toggle.addEventListener('click', () => {
    const isOpen = mobileMenu.classList.toggle('open');
    toggle.classList.toggle('open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    mobileMenu.setAttribute('aria-hidden', String(!isOpen));
  });

  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      mobileMenu.setAttribute('aria-hidden', 'true');
    });
  });

  mobileMenu.querySelectorAll('.nav-mobile-expand').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.nav-mobile-group');
      if (!group) return;
      const isOpen = group.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(isOpen));
    });
  });
}

/* ─── Nav active states ───────────────────────────────────────────────────── */
const navPath = window.location.pathname.replace(/\/$/, '') || '/';
const navMatchers = [
  { match: (p) => p === '/agents' || p.startsWith('/agents/'), sel: '[data-nav="adtech-agents"]' },
  { match: (p) => p === '/demos/account-research' || p.startsWith('/demos/account-research/'), sel: '[data-nav="salestech-agents"]' },
  { match: (p) => (p === '/demos' || p.startsWith('/demos/')) && !p.startsWith('/demos/account-research'), sel: '[data-nav="demos"]' },
  { match: (p) => p === '/case-studies' || p.startsWith('/case-studies/'), sel: '[data-nav="case-studies"]' },
];

for (const { match, sel } of navMatchers) {
  if (match(navPath)) {
    document.querySelectorAll(sel).forEach(el => el.setAttribute('aria-current', 'page'));
  }
}

/* ─── Scroll-reveal (Intersection Observer) ───────────────────────────────── */
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
);

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

/* ─── Footer year ─────────────────────────────────────────────────────────── */
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ─── Smooth scroll for anchor links ──────────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const offset = parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--nav-h'), 10) || 72;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});

/* ─── Contact form (Web3Forms) ────────────────────────────────────────────── */
const form = document.getElementById('contact-form');
if (form) {
  const redirectInput = document.getElementById('form-redirect');
  const statusEl = document.getElementById('form-status');
  const submitBtn = document.getElementById('submit-btn');
  const btnText = submitBtn?.querySelector('.btn-text');
  const btnLoading = submitBtn?.querySelector('.btn-loading');

  const redirectUrl = new URL('thank-you.html', window.location.href).href;
  if (redirectInput) redirectInput.value = redirectUrl;

  const fields = {
    name: {
      el: document.getElementById('name'),
      error: document.getElementById('name-error'),
      validate: (v) => v.trim() ? '' : 'Name is required.',
    },
    email: {
      el: document.getElementById('email'),
      error: document.getElementById('email-error'),
      validate: (v) => {
        if (!v.trim()) return 'Email is required.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'Enter a valid email address.';
        return '';
      },
    },
    message: {
      el: document.getElementById('message'),
      error: document.getElementById('message-error'),
      validate: (v) => v.trim() ? '' : 'Message is required.',
    },
  };

  const showStatus = (message, type) => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `form-status ${type}`;
    statusEl.hidden = false;
  };

  const clearStatus = () => {
    if (!statusEl) return;
    statusEl.hidden = true;
    statusEl.textContent = '';
    statusEl.className = 'form-status';
  };

  const setLoading = (loading) => {
    if (!submitBtn) return;
    submitBtn.disabled = loading;
    if (btnText) btnText.hidden = loading;
    if (btnLoading) btnLoading.hidden = !loading;
  };

  const validateForm = () => {
    let valid = true;
    Object.values(fields).forEach(({ el, error, validate }) => {
      if (!el) return;
      const msg = validate(el.value);
      el.classList.toggle('invalid', !!msg);
      if (error) error.textContent = msg;
      if (msg) valid = false;
    });
    return valid;
  };

  Object.values(fields).forEach(({ el, error, validate }) => {
    if (!el) return;
    el.addEventListener('blur', () => {
      const msg = validate(el.value);
      el.classList.toggle('invalid', !!msg);
      if (error) error.textContent = msg;
    });
    el.addEventListener('input', () => {
      if (el.classList.contains('invalid')) {
        const msg = validate(el.value);
        el.classList.toggle('invalid', !!msg);
        if (error) error.textContent = msg;
      }
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearStatus();

    if (!validateForm()) return;

    setLoading(true);

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        showStatus('Thank you — your message has been sent. We\'ll be in touch within one business day.', 'success');
        form.reset();
        Object.values(fields).forEach(({ el }) => el?.classList.remove('invalid'));
      } else {
        showStatus(data.message || 'Something went wrong. Please try again or email us directly.', 'error');
      }
    } catch {
      showStatus('Network error — please check your connection and try again.', 'error');
    } finally {
      setLoading(false);
    }
  });
}
