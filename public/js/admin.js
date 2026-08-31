// Admin panel functionality — uses backend API
import * as api from './api.js';
import { getContent, updateContent, resetContent, getStats, getVisitors, getVisitorTimeline, deleteVisitor, bulkDeleteVisitors, getFeedback, deleteFeedback, exportData, generateEngagementReport } from './api.js';
import {
  CK_DEFAULTS,
  CK_CURRENT,
  CK_GROUPS,
  applyContent
} from './content.js';

const ADMIN_TABS = ['ap-records', 'ap-editor', 'ap-report', 'ap-timeline'];

let currentVisitorPage = 1;
let currentFeedbackPage = 1;
let selectedVisitorId = null;

// ============ ADMIN LOGIN ============

export async function adminLogin(username, password) {
  try {
    await api.adminLogin(username, password);
    await enterAdmin();
    return true;
  } catch (err) {
    return false;
  }
}

export async function adminLogout() {
  await api.adminLogout();
  show('view-gate');
}

// ============ ADMIN DASHBOARD ============

async function enterAdmin() {
  show('view-admin');
  renderStorageModeBanner();
  await loadDashboardContent();
  buildEditorUI();
  await Promise.all([renderAdminRecords(), renderStats()]);
}

function renderStorageModeBanner() {
  $('storage-mode-text').innerHTML = '<b>Live gateway connected.</b> Visitor logins and feedback are written to the central database before the visitor continues, and admin records are read from the same database.';
}

// ============ STATS ============

async function renderStats() {
  try {
    const stats = await getStats();
    const container = $('admin-stats-grid');
    if (!container) return;

    const ov = stats.overview;
    container.innerHTML = `
      <div class="index-card"><div class="num">${ov.total_visitors}</div><span class="label">Total Visitors</span></div>
      <div class="index-card"><div class="num">${ov.unique_visitors}</div><span class="label">Unique Visitors</span></div>
      <div class="index-card"><div class="num">${ov.total_sessions}</div><span class="label">Total Sessions</span></div>
      <div class="index-card"><div class="num">${formatDuration(ov.avg_session_duration)}</div><span class="label">Avg Session</span></div>
      <div class="index-card"><div class="num">${ov.total_feedback}</div><span class="label">Feedback</span></div>
      <div class="index-card"><div class="num">${(ov.avg_rating || 0).toFixed(1)}</div><span class="label">Avg Rating</span></div>
      <div class="index-card"><div class="num">${ov.total_downloads}</div><span class="label">Downloads</span></div>
    `;

    // Project popularity
    const projContainer = $('admin-project-popularity');
    if (projContainer && stats.projects.length > 0) {
      projContainer.innerHTML = stats.projects.map(p => `
        <div class="index-card" style="border-left-color:var(--gold)">
          <div class="num" style="font-size:24px;">${p.views}</div>
          <span class="label">${p.project} · ${p.unique_visitors} uniq</span>
        </div>
      `).join('');
    }

    // Top sections
    const secContainer = $('admin-top-sections');
    if (secContainer && stats.topSections.length > 0) {
      secContainer.innerHTML = stats.topSections.map(s => `
        <li><span class="n">·</span><span>${esc(s.section)} — ${s.views} views (${s.unique_visitors} unique)</span></li>
      `).join('');
    }

    // Feedback summary
    const fbContainer = $('admin-feedback-summary');
    if (fbContainer && stats.feedbackSummary.length > 0) {
      fbContainer.innerHTML = stats.feedbackSummary.map(f => `
        ${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}: ${f.count} responses
      `).join('<br>');
    }
  } catch (e) {
    console.error('Stats failed:', e);
  }
}

// ============ RECORDS ============

async function renderAdminRecords() {
  try {
    const [visitorsRes, feedbackRes] = await Promise.all([
      getVisitors({ page: currentVisitorPage, limit: 20 }),
      getFeedback({ page: currentFeedbackPage, limit: 20 })
    ]);

    const vb = $('admin-visitors-body');
    const fb = $('admin-feedback-body');

    if (vb) {
      vb.innerHTML = visitorsRes.visitors.map(r => `
        <tr>
          <td><a href="#" onclick="viewVisitor('${r.id}')" style="color:var(--rust);text-decoration:underline;">${esc(r.name)}</a></td>
          <td>${esc(r.email)}</td>
          <td>${esc(fmtTime(r.created_at))}</td>
          <td><button class="btn btn-danger btn-sm" onclick="deleteAdminRecord('visitors','${esc(r.id)}')">Delete</button></td>
        </tr>
      `).join('') || '<tr><td colspan="4" class="empty-state">No visitors yet.</td></tr>';
    }

    if (fb) {
      fb.innerHTML = feedbackRes.feedback.map(r => `
        <tr>
          <td>${esc(r.name)}</td>
          <td><span class="stars-static">${'★'.repeat(Number(r.rating) || 0)}</span></td>
          <td>${esc(r.comment || '')}</td>
          <td>${esc(fmtTime(r.created_at))}</td>
          <td><button class="btn btn-danger btn-sm" onclick="deleteAdminRecord('feedback','${esc(r.id)}')">Delete</button></td>
        </tr>
      `).join('') || '<tr><td colspan="5" class="empty-state">No feedback yet.</td></tr>';
    }

    // Pagination
    renderPagination();
  } catch (e) {
    toast('Could not load the live records.');
  }
}

function renderPagination() {
  const vp = $('visitor-pagination');
  const fp = $('feedback-pagination');
  // Simple prev/next
  if (vp) {
    vp.innerHTML = `
      <button class="btn btn-ghost btn-sm" ${currentVisitorPage === 1 ? 'disabled' : ''} onclick="changeVisitorPage(-1)">← Prev</button>
      <span style="margin:0 12px;">Page ${currentVisitorPage}</span>
      <button class="btn btn-ghost btn-sm" onclick="changeVisitorPage(1)">Next →</button>
    `;
  }
  if (fp) {
    fp.innerHTML = `
      <button class="btn btn-ghost btn-sm" ${currentFeedbackPage === 1 ? 'disabled' : ''} onclick="changeFeedbackPage(-1)">← Prev</button>
      <span style="margin:0 12px;">Page ${currentFeedbackPage}</span>
      <button class="btn btn-ghost btn-sm" onclick="changeFeedbackPage(1)">Next →</button>
    `;
  }
}

// ============ INDIVIDUAL VISITOR TIMELINE ============

export async function viewVisitor(visitorId) {
  selectedVisitorId = visitorId;
  try {
    const data = await getVisitorTimeline(visitorId);
    show('view-admin');
    document.querySelectorAll('#admin-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#admin-tabs [data-panel="ap-timeline"]')?.classList.add('active');
    document.querySelectorAll('#view-admin .panel').forEach(p => p.classList.remove('active'));
    $('ap-timeline').classList.add('active');

    renderVisitorTimeline(data);
  } catch (e) {
    toast('Could not load visitor timeline.');
  }
}

function renderVisitorTimeline(data) {
  const container = $('visitor-timeline-container');
  if (!container) return;

  const visitor = data.visitor;
  const sessions = data.sessions || [];
  const feedback = data.feedback || [];
  const timeline = data.timeline || [];

  const totalDuration = sessions.reduce((acc, s) => acc + (s.duration_sec || 0), 0);

  container.innerHTML = `
    <div class="visitor-header">
      <h2>${esc(visitor.name)}</h2>
      <p class="desc">${esc(visitor.email)}</p>
      <div class="visitor-meta">
        <span>First seen: ${esc(fmtTime(visitor.created_at))}</span>
        <span>Last seen: ${esc(fmtTime(visitor.last_seen_at))}</span>
        <span>Sessions: ${sessions.length}</span>
        <span>Total time: ${formatDuration(totalDuration + ' seconds')}</span>
      </div>
    </div>

    <h3 style="margin-top:24px;">Activity Timeline</h3>
    <div class="timeline">
      ${timeline.map(a => `
        <div class="tl-item">
          <span class="tl-tag">${esc(a.type)}</span>
          <h4>${esc(formatActivityLabel(a.type))}</h4>
          ${a.target ? `<p>${esc(a.target)}</p>` : ''}
          <p class="tl-time">${esc(fmtTime(a.created_at))}</p>
        </div>
      `).join('')}
    </div>

    ${feedback.length > 0 ? `
      <h3 style="margin-top:24px;">Feedback</h3>
      ${feedback.map(f => `
        <div class="card" style="padding:16px;margin-bottom:12px;">
          <div class="stars-static">${'★'.repeat(Number(f.rating) || 0)}</div>
          <p>${esc(f.comment || '(no comment)')}</p>
          <small style="color:var(--ink-soft);">${esc(fmtTime(f.created_at))}</small>
        </div>
      `).join('')}
    ` : ''}
  `;
}

// ============ EDITOR ============

async function loadDashboardContent() {
  try {
    const res = await getContent();
    applyContent(res.content || {});
  } catch (e) {
    console.warn('Could not load content from server');
  }
}

function buildEditorUI() {
  const host = $('editor-groups');
  if (!host) return;
  host.innerHTML = '';

  const groups = {};
  Object.keys(CK_DEFAULTS).forEach(key => {
    const prefix = key.split('.')[0];
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(key);
  });

  Object.keys(CK_GROUPS).forEach(prefix => {
    const keys = groups[prefix];
    if (!keys || keys.length === 0) return;
    const details = document.createElement('details');
    details.className = 'editor-group';
    const summary = document.createElement('summary');
    summary.textContent = CK_GROUPS[prefix] + ' (' + keys.length + ' fields)';
    details.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'editor-group-body';
    keys.forEach(key => {
      const field = document.createElement('div');
      field.className = 'editor-field';
      const label = document.createElement('label');
      label.textContent = key;
      const value = CK_CURRENT[key] != null ? CK_CURRENT[key] : CK_DEFAULTS[key];
      const long = value.length > 70;
      const input = document.createElement(long ? 'textarea' : 'input');
      if (!long) input.type = 'text';
      input.value = value;
      input.dataset.ckInput = key;
      field.appendChild(label);
      field.appendChild(input);
      body.appendChild(field);
    });
    details.appendChild(body);
    host.appendChild(details);
  });
}

export async function saveContent() {
  const content = {};
  document.querySelectorAll('[data-ck-input]').forEach(input => {
    const key = input.dataset.ckInput;
    const val = input.value.trim();
    content[key] = val || CK_DEFAULTS[key];
  });

  try {
    await updateContent(content);
    applyContent(content);
    const msg = $('save-msg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2500);
    toast('Dashboard content updated — live for every viewer.');
  } catch (e) {
    toast('Failed to save content.');
  }
}

export async function resetContentAll() {
  if (!confirm('Reset every field on the dashboard back to its original text? This cannot be undone.')) return;
  try {
    await resetContent();
    applyContent({});
    buildEditorUI();
    toast('Dashboard reset to original text.');
  } catch (e) {
    toast('Failed to reset content.');
  }
}

// ============ EXPORTS ============

export function exportVisitors(format) {
  const from = $('export-from')?.value || '';
  const to = $('export-to')?.value || '';
  exportData('visitors', format, from || undefined, to || undefined);
}

export function exportFeedback(format) {
  const from = $('export-from')?.value || '';
  const to = $('export-to')?.value || '';
  exportData('feedback', format, from || undefined, to || undefined);
}

export function exportReport(format) {
  const from = $('report-from')?.value || '';
  const to = $('report-to')?.value || '';
  generateEngagementReport(format, from || undefined, to || undefined);
}

// ============ DELETE ============

export async function deleteAdminRecord(type, id) {
  if (!confirm('Delete this record permanently?')) return;
  try {
    if (type === 'visitors') await deleteVisitor(id);
    else await deleteFeedback(id);
    await renderAdminRecords();
    toast('Record deleted.');
  } catch (e) {
    toast('Delete failed.');
  }
}

export async function deleteAllVisitorLogs() {
  const confirmed = confirm('Delete ALL visitor logs permanently? This cannot be undone.');
  if (!confirmed) return;
  try {
    await bulkDeleteVisitors([]); // Empty array = delete all in some implementations
    await renderAdminRecords();
    toast('All visitor logs deleted.');
  } catch (e) {
    toast('Could not delete all visitor logs.');
  }
}

// ============ PAGINATION HANDLERS ============

export function changeVisitorPage(delta) {
  currentVisitorPage = Math.max(1, currentVisitorPage + delta);
  renderAdminRecords();
}

export function changeFeedbackPage(delta) {
  currentFeedbackPage = Math.max(1, currentFeedbackPage + delta);
  renderAdminRecords();
}

// ============ UTILITIES ============

function formatActivityLabel(type) {
  const labels = {
    login: 'Logged in',
    view_overview: 'Viewed Project Selector',
    view_dashboard: 'Opened Dashboard',
    view_tab: 'Viewed Section',
    view_section: 'Viewed Section',
    download: 'Downloaded Report',
    feedback_open: 'Opened Feedback',
    feedback_submit: 'Submitted Feedback',
    logout: 'Logged out',
  };
  return labels[type] || type;
}

function formatDuration(interval) {
  if (!interval) return '0s';
  const str = String(interval);
  const match = str.match(/(\d+):(\d+):(\d+)/);
  if (match) {
    const h = parseInt(match[1]), m = parseInt(match[2]), s = parseInt(match[3]);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }
  return str;
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function fmtTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '';
  }
}

function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

