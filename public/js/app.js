// Main application logic — visitor-facing + navigation + feedback
import * as api from './api.js';
import { adminLogin, adminLogout, viewVisitor, saveContent, resetContentAll, exportVisitors, exportFeedback, exportReport, changeVisitorPage, changeFeedbackPage, deleteAdminRecord, deleteAllVisitorLogs } from './admin.js';
import { renderAllCharts, renderAllChartsP2 } from './charts.js';
import { captureDefaults, applyContent } from './content.js';

// Make functions globally available for inline event handlers
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.viewVisitor = viewVisitor;
window.saveContent = saveContent;
window.resetContentAll = resetContentAll;
window.exportVisitors = exportVisitors;
window.exportFeedback = exportFeedback;
window.exportReport = exportReport;
window.changeVisitorPage = changeVisitorPage;
window.changeFeedbackPage = changeFeedbackPage;
window.deleteAdminRecord = deleteAdminRecord;
window.deleteAllVisitorLogs = deleteAllVisitorLogs;

// ============ STATE ============
let currentUser = null; // {name, email}
let sessionId = null;   // From backend
let loginTime = null;   // For session duration
let pendingStar = 0;
let currentProject = null; // 'p1' | 'p2' | 'overview'

// ============ UTILITIES ============
function $(id) { return document.getElementById(id); }

function show(viewId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const el = $(viewId);
  if (el) el.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function fmtTime(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString(); } catch { return ''; }
}

function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ============ NAVIGATION ============
document.querySelectorAll('[data-back]').forEach(btn => {
  btn.addEventListener('click', () => show(btn.dataset.back));
});

$('btn-go-user').addEventListener('click', () => show('view-user-login'));
$('btn-go-admin').addEventListener('click', () => show('view-admin-login'));

function wireTabs(tabsId, scopeSelector) {
  const tabsEl = $(tabsId);
  if (!tabsEl) return;
  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    tabsEl.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll(scopeSelector + ' .panel').forEach(p => p.classList.remove('active'));
    const panel = $(btn.dataset.panel);
    if (panel) panel.classList.add('active');

    // Track tab view
    if (sessionId && btn.dataset.panel) {
      trackActivity('view_tab', btn.dataset.panel);
    }
  });
}

wireTabs('user-tabs', '#view-dashboard');
wireTabs('p2-tabs', '#view-dashboard-p2');
wireTabs('admin-tabs', '#view-admin');

// ============ PROJECT SELECTOR ============
$('btn-select-p1').addEventListener('click', () => {
  currentProject = 'p1';
  show('view-dashboard');
  if (sessionId) trackActivity('view_dashboard', 'Project One', { project: 'p1' });
});

$('btn-select-p2').addEventListener('click', () => {
  currentProject = 'p2';
  show('view-dashboard-p2');
  if (sessionId) trackActivity('view_dashboard', 'Project Two', { project: 'p2' });
});

$('btn-projects-p1').addEventListener('click', () => {
  show('view-overview');
  if (sessionId) trackActivity('view_overview', 'overview');
});
$('btn-projects-p2').addEventListener('click', () => {
  show('view-overview');
  if (sessionId) trackActivity('view_overview', 'overview');
});

$('btn-overview-logout').addEventListener('click', openFeedbackModal);

// ============ USER LOGIN ============
$('user-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('u-name').value.trim();
  const email = $('u-email').value.trim();
  const errEl = $('u-login-error');
  errEl.textContent = '';

  if (!name || !email) {
    errEl.textContent = 'Please enter both your name and email.';
    return;
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    errEl.textContent = "That email address doesn't look right.";
    return;
  }

  try {
    const res = await api.createVisitor(name, email, navigator.userAgent, document.referrer);
    currentUser = { name, email };
    sessionId = res.sessionId;
    loginTime = Date.now();

    // Set name fields
    const dashName = $('dash-who-name');
    const dashNameP2 = $('dash-who-name-p2');
    const overviewName = $('ov-who-name');
    if (dashName) dashName.textContent = name;
    if (dashNameP2) dashNameP2.textContent = name;
    if (overviewName) overviewName.textContent = name;

    await loadDashboardContent();
    show('view-overview');
  } catch (err) {
    errEl.textContent = 'Unable to record your visit. Please try again.';
    console.error('Login failed:', err);
  }
});

// ============ ADMIN LOGIN ============
$('admin-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = $('a-user').value.trim();
  const pass = $('a-pass').value.trim();
  const errEl = $('a-login-error');
  errEl.textContent = '';

  try {
    const success = await adminLogin(user, pass);
    if (success) {
      $('a-user').value = '';
      $('a-pass').value = '';
    } else {
      errEl.textContent = 'Incorrect User ID or password.';
    }
  } catch (err) {
    errEl.textContent = 'Unable to connect to server. Please try again.';
    console.error('Admin login failed:', err);
  }
});

// ============ FEEDBACK ============
function openFeedbackModal() {
  pendingStar = 0;
  renderStars();
  $('feedback-text').value = '';
  $('feedback-modal').classList.remove('hidden');
  if (sessionId) trackActivity('feedback_open', 'logout_modal');
}

$('btn-logout').addEventListener('click', openFeedbackModal);
$('btn-logout-p2').addEventListener('click', openFeedbackModal);

function renderStars() {
  document.querySelectorAll('.star-btn').forEach(b => {
    b.classList.toggle('filled', parseInt(b.dataset.star, 10) <= pendingStar);
  });
}

document.getElementById('star-row').addEventListener('click', (e) => {
  const b = e.target.closest('.star-btn');
  if (!b) return;
  pendingStar = parseInt(b.dataset.star, 10);
  renderStars();
});

async function finishLogout(withFeedback) {
  if (withFeedback && sessionId) {
    const text = $('feedback-text').value.trim();
    try {
      await api.submitFeedback(sessionId, pendingStar, text, currentProject, 'logout');
    } catch (err) {
      console.warn('Feedback submission failed:', err);
    }
  }

  // End session
  if (sessionId && loginTime) {
    const durationSec = Math.floor((Date.now() - loginTime) / 1000);
    try {
      await api.endSession(sessionId, durationSec);
    } catch (err) {
      console.warn('Session end failed:', err);
    }
  }

  $('feedback-modal').classList.add('hidden');
  currentUser = null;
  sessionId = null;
  loginTime = null;
  $('u-name').value = '';
  $('u-email').value = '';
  show('view-gate');
}

$('btn-submit-feedback').addEventListener('click', () => finishLogout(true));
$('btn-skip-feedback').addEventListener('click', () => finishLogout(false));

$('btn-admin-logout').addEventListener('click', async () => {
  await adminLogout();
});

// ============ DOWNLOAD TRACKING ============
$('btn-download-report').addEventListener('click', () => {
  trackDownload('Operational_Assessment_Report.pdf');
  downloadReport();
});
$('btn-admin-download-report').addEventListener('click', () => {
  trackDownload('Operational_Assessment_Report.pdf');
  downloadReport();
});
$('btn-download-p2-report').addEventListener('click', () => {
  trackDownload('Project_Two_Report.html');
  downloadProjectTwoReport();
});
$('btn-admin-download-p2-report').addEventListener('click', () => {
  trackDownload('Project_Two_Report.html');
  downloadProjectTwoReport();
});

// ============ ACTIVITY TRACKING ============
async function trackActivity(type, target, metadata = {}) {
  if (!sessionId) return;
  try {
    await api.logActivity(sessionId, type, target, metadata);
  } catch (err) {
    console.warn('Activity tracking failed:', err);
  }
}

async function trackDownload(reportName) {
  if (!sessionId) return;
  try {
    await api.trackDownload(sessionId, reportName);
  } catch (err) {
    console.warn('Download tracking failed:', err);
  }
}

// ============ DASHBOARD CONTENT ============

export async function loadDashboardContent() {
  try {
    const content = await api.getContent();
    applyContent(content.content || {});
    return content;
  } catch (e) {
    console.warn('Could not load dashboard content');
    return { content: {} };
  }
}

window.loadDashboardContent = loadDashboardContent;
// ============ REPORT DOWNLOADS ============
const REPORT_PDF_BASE64 = "..."; // PDF will be loaded from CDN in production

function downloadReport() {
  // In production, fetch from CDN
  const pdfUrl = '/assets/reports/operational-assessment.pdf';
  const a = document.createElement('a');
  a.href = pdfUrl;
  a.download = 'Operational_Assessment_Report.pdf';
  a.click();
}

function downloadProjectTwoReport() {
  const html = `...`; // HTML report content
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Project_Two_Report.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ============ INIT ============
function init() {
  // The DOM must exist before we capture editable dashboard text.
  captureDefaults();

  // Load any saved dashboard content from the backend.
  loadDashboardContent();

  // Start on the gate screen.
  show('view-gate');

  // Render charts after the DOM is ready.
  renderAllCharts();
  renderAllChartsP2();

  let frameHideTimer = null;

  document.addEventListener('mousemove', (e) => {
    document.documentElement.style.setProperty(
      '--spot-x',
      e.clientX + 'px'
    );

    document.documentElement.style.setProperty(
      '--spot-y',
      e.clientY + 'px'
    );

    document.body.classList.add('frame-active');

    clearTimeout(frameHideTimer);

    frameHideTimer = setTimeout(() => {
      document.body.classList.remove('frame-active');
    }, 1800);
  }, { passive: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

