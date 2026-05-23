/* ─── Nav scroll behavior ─────────────────────────────────────────────────── */
const nav = document.getElementById('nav');

const onScroll = () => {
  nav.classList.toggle('scrolled', window.scrollY > 10);
};

window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

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
