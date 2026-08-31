// Local storage fallback ONLY for development / offline use
// In production, all data goes to the backend API

const PREFIX = 'cim_';

export function get(key) {
  try {
    const val = localStorage.getItem(PREFIX + key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

export function set(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
    return true;
  } catch {
    return false;
  }
}

export function clearAll() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k));
    return true;
  } catch {
    return false;
  }
}

// Session storage for temporary UI state (not persistent data)
export const session = {
  get(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      sessionStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      sessionStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
};