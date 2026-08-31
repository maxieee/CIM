// API client for CIM Dashboard — handles all backend communication
// Uses the local backend on localhost and /api in production.

const API_BASE =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : '/api';

let adminToken = null; // In memory only, never localStorage

export function setAdminToken(token) {
  adminToken = token;
}

export function getAdminToken() {
  return adminToken;
}

export function clearAdminToken() {
  adminToken = null;
}

function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (adminToken) {
    headers['Authorization'] = `Bearer ${adminToken}`;
  }

  return headers;
}

async function request(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: getHeaders(),
  });

  if (!res.ok) {
    let errorMsg = 'Request failed';

    try {
      const err = await res.json();
      errorMsg = err.error || errorMsg;
    } catch {
      // Response was not JSON
    }

    throw new Error(errorMsg);
  }

  const contentType = res.headers.get('content-type');

  if (contentType && contentType.includes('application/json')) {
    return res.json();
  }

  return res;
}

// ============================================================
// VISITOR ENDPOINTS
// ============================================================

export async function createVisitor(name, email, userAgent, referrer) {
  return request('/visitors', {
    method: 'POST',
    body: JSON.stringify({
      name,
      email,
      userAgent,
      referrer,
    }),
  });
}

export async function logActivity(
  sessionId,
  type,
  target,
  metadata = {}
) {
  return request(`/visitors/sessions/${sessionId}/activity`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      type,
      target,
      metadata,
    }),
  });
}

export async function endSession(sessionId, durationSec) {
  return request(`/visitors/sessions/${sessionId}/logout`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      durationSec,
    }),
  });
}

export async function submitFeedback(
  sessionId,
  rating,
  comment,
  project,
  section
) {
  return request('/visitors/feedback', {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      rating,
      comment,
      project,
      section,
    }),
  });
}

export async function trackDownload(sessionId, reportName) {
  return request('/visitors/download', {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      reportName,
    }),
  });
}

// ============================================================
// ADMIN ENDPOINTS
// ============================================================

export async function adminLogin(username, password) {
  const res = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
    }),
  });

  setAdminToken(res.accessToken);

  return res;
}

export async function adminLogout() {
  try {
    await request('/auth/logout', {
      method: 'POST',
    });
  } finally {
    clearAdminToken();
  }
}

export async function getStats(from, to) {
  const params = new URLSearchParams();

  if (from) {
    params.set('from', from);
  }

  if (to) {
    params.set('to', to);
  }

  return request(`/admin/stats?${params.toString()}`);
}

export async function getVisitors(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      query.set(key, value);
    }
  });

  return request(`/admin/visitors?${query.toString()}`);
}

export async function getVisitorTimeline(id) {
  return request(`/admin/visitors/${id}`);
}

export async function deleteVisitor(id) {
  return request(`/admin/visitors/${id}`, {
    method: 'DELETE',
  });
}

export async function bulkDeleteVisitors(ids) {
  return request('/admin/visitors/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({
      ids,
    }),
  });
}

export async function getFeedback(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      query.set(key, value);
    }
  });

  return request(`/admin/feedback?${query.toString()}`);
}

export async function deleteFeedback(id) {
  return request(`/admin/feedback/${id}`, {
    method: 'DELETE',
  });
}

export async function getContent() {
  return request('/content');
}

export async function updateContent(content) {
  return request('/admin/content', {
    method: 'POST',
    body: JSON.stringify(content),
  });
}

export async function resetContent() {
  return request('/admin/content/reset', {
    method: 'POST',
  });
}

export async function exportData(type, format, from, to) {
  const params = new URLSearchParams();

  params.set('format', format);

  if (from) {
    params.set('from', from);
  }

  if (to) {
    params.set('to', to);
  }

  const response = await request(
    `/admin/export/${type}?${params.toString()}`
  );

  const blob = await response.blob();

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');

  a.href = url;
  a.download = `${type}_${new Date()
    .toISOString()
    .split('T')[0]}.${format}`;

  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export async function generateEngagementReport(
  format,
  from,
  to
) {
  const params = new URLSearchParams();

  params.set('format', format);

  if (from) {
    params.set('from', from);
  }

  if (to) {
    params.set('to', to);
  }

  const response = await request(
    `/admin/export/engagement-report?${params.toString()}`
  );

  const blob = await response.blob();

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');

  a.href = url;
  a.download = `engagement_report_${new Date()
    .toISOString()
    .split('T')[0]}.${format}`;

  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}