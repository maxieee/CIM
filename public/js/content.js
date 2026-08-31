import { CK_GROUPS } from './data.js';

export const CK_DEFAULTS = {};
export let CK_CURRENT = {};

export function prepareVisitorInterfaceEditing() {
  const roots = [
    ['view-gate', 'gateUI'],
    ['view-user-login', 'loginUI'],
    ['view-overview', 'overviewUI'],
    ['view-dashboard', 'dashboardUI'],
    ['view-dashboard-p2', 'p2'],
    ['feedback-modal', 'feedbackUI']
  ];

  roots.forEach(([rootId, prefix]) => {
    const root = document.getElementById(rootId);
    if (!root) return;

    let counter = 0;

    const walk = (el) => {
      if (el.hasAttribute && el.hasAttribute('data-ck')) return;

      Array.from(el.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();

          if (!text || !/[A-Za-z0-9₹%]/.test(text)) return;

          const span = document.createElement('span');
          span.setAttribute(
            'data-ck',
            prefix + '.auto.' + (++counter)
          );

          span.textContent = node.textContent;
          node.parentNode.replaceChild(span, node);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          walk(node);
        }
      });
    };

    walk(root);
  });
}

export function captureDefaults() {
  prepareVisitorInterfaceEditing();

  document.querySelectorAll('[data-ck]').forEach(el => {
    const key = el.getAttribute('data-ck');

    if (!(key in CK_DEFAULTS)) {
      CK_DEFAULTS[key] = el.textContent.trim();
    }
  });
}

export function applyContent(content) {
  CK_CURRENT = Object.assign(
    {},
    CK_DEFAULTS,
    content || {}
  );

  document.querySelectorAll('[data-ck]').forEach(el => {
    const key = el.getAttribute('data-ck');

    if (CK_CURRENT[key] != null) {
      el.textContent = CK_CURRENT[key];
    }
  });
}

export { CK_GROUPS };
