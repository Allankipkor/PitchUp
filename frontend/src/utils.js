let API_BASE = import.meta.env.VITE_API_URL;

if (!API_BASE) {
  // Safe fallback: if running on Vercel/production, auto-route to live Render backend
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    API_BASE = 'https://pitchup-yc95.onrender.com/api';
  } else {
    API_BASE = 'http://localhost:8000/api';
  }
}


/**
 * Custom fetch wrapper that enforces credentials (for httpOnly cookies)
 * and formats JSON payloads and query parameters.
 */
export async function apiFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  
  // Force credentials to be included for secure httpOnly cookie authentication!
  options.credentials = 'include';
  
  if (options.body && typeof options.body === 'object') {
    options.body = JSON.stringify(options.body);
    options.headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    let errorMessage = `API Error ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.detail || errorMessage;
    } catch (e) {
      // Non-JSON response or empty
    }
    throw new Error(errorMessage);
  }

  // Handle empty responses
  if (response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch (e) {
    return null;
  }
}

// --- API Helpers ---

export const authAPI = {
  requestMagicLink: (email) => apiFetch('/auth/magic-link', {
    method: 'POST',
    body: { email }
  }),
  
  verifyMagicLink: (token) => apiFetch('/auth/verify', {
    method: 'POST',
    body: { token }
  }),
  
  getMe: () => apiFetch('/auth/me'),
  
  updateMe: (name, phone) => apiFetch('/auth/me', {
    method: 'PUT',
    body: { name, phone }
  }),
  
  logout: () => apiFetch('/auth/logout', {
    method: 'POST'
  })
};

export const gamesAPI = {
  list: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.format) params.append('format', filters.format);
    if (filters.skill_level) params.append('skill_level', filters.skill_level);
    if (filters.date) params.append('date', filters.date);
    if (filters.lat) params.append('lat', filters.lat);
    if (filters.lng) params.append('lng', filters.lng);
    if (filters.radius_km) params.append('radius_km', filters.radius_km);
    
    const queryStr = params.toString();
    return apiFetch(`/games${queryStr ? `?${queryStr}` : ''}`);
  },
  
  get: (id) => apiFetch(`/games/${id}`),
  
  create: (data) => apiFetch('/games', {
    method: 'POST',
    body: data
  }),
  
  join: (id) => apiFetch(`/games/${id}/join`, {
    method: 'POST'
  }),
  
  leave: (id) => apiFetch(`/games/${id}/leave`, {
    method: 'POST'
  }),
  
  addComment: (id, text) => apiFetch(`/games/${id}/comments`, {
    method: 'POST',
    body: { text }
  }),
  
  cancel: (id) => apiFetch(`/games/${id}/cancel`, {
    method: 'POST'
  }),
  
  recordAttendance: (id, updates) => apiFetch(`/games/${id}/attendance`, {
    method: 'POST',
    body: updates // Array of { user_id, showed_up }
  })
};

export const clubsAPI = {
  list: () => apiFetch('/clubs'),
  
  create: (data) => apiFetch('/clubs', {
    method: 'POST',
    body: data
  }),
  
  update: (id, data) => apiFetch(`/clubs/${id}`, {
    method: 'PUT',
    body: data
  })
};

export const usersAPI = {
  getReliability: (id) => apiFetch(`/users/${id}/reliability`)
};

export const inboxAPI = {
  list: () => apiFetch('/notifications'),
  
  markRead: (id) => apiFetch(`/notifications/${id}/read`, {
    method: 'POST'
  })
};

export const geocodeAddress = (q) => {
  return apiFetch(`/geocode?q=${encodeURIComponent(q)}`);
};

// --- Currency Helpers ---

const localeCurrencyMap = {
  'en-GB': 'GBP',
  'en-US': 'USD',
  'en-KE': 'KES',
  'sw-KE': 'KES',
  'en-NG': 'NGN',
  'en-ZA': 'ZAR',
  'en-CA': 'CAD',
  'en-AU': 'AUD',
  'en-NZ': 'NZD',
  'en-IN': 'INR',
  'hi-IN': 'INR'
};

export function getLocalCurrencyCode() {
  const locale = navigator.language || 'en-GB';
  if (localeCurrencyMap[locale]) {
    return localeCurrencyMap[locale];
  }
  const parts = locale.split('-');
  if (parts.length > 1) {
    const country = parts[1].toUpperCase();
    const countryMap = {
      'GB': 'GBP',
      'US': 'USD',
      'KE': 'KES',
      'NG': 'NGN',
      'ZA': 'ZAR',
      'CA': 'CAD',
      'AU': 'AUD',
      'NZ': 'NZD',
      'IN': 'INR',
      'DE': 'EUR',
      'FR': 'EUR',
      'IT': 'EUR',
      'ES': 'EUR',
      'NL': 'EUR',
      'BE': 'EUR',
      'IE': 'EUR'
    };
    if (countryMap[country]) {
      return countryMap[country];
    }
  }
  const euroLanguages = ['de', 'fr', 'it', 'es', 'nl', 'pt', 'el', 'fi', 'ga'];
  if (euroLanguages.includes(parts[0].toLowerCase())) {
    return 'EUR';
  }
  return 'GBP';
}

export function getLocalCurrencySymbol() {
  const currencyCode = getLocalCurrencyCode();
  const locale = navigator.language || 'en-GB';
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    const parts = formatter.formatToParts(0);
    const currencyPart = parts.find(part => part.type === 'currency');
    return currencyPart ? currencyPart.value : '£';
  } catch (e) {
    return '£';
  }
}

export function formatCurrency(amount) {
  if (amount === 0 || amount === null || amount === undefined) {
    return 'FREE';
  }
  const currencyCode = getLocalCurrencyCode();
  const locale = navigator.language || 'en-GB';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode
    }).format(amount);
  } catch (e) {
    return `£${amount.toFixed(2)}`;
  }
}
