// Tenká vrstva nad fetch() pro komunikaci s backend API.
const BASE = "/api";

// Zavolá se, kdykoli server odpoví 401 (nepřihlášeno / session vypršela) —
// App.jsx si na to napojí přepnutí na přihlašovací obrazovku.
let unauthorizedHandler = null;
export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 401 && unauthorizedHandler) {
    unauthorizedHandler();
  }
  if (!res.ok) {
    let message = "Požadavek na server selhal.";
    try {
      const body = await res.json();
      if (body && body.error) message = body.error;
    } catch {
      // odpověď nebyla JSON — necháme obecnou zprávu
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getMe: () => request("/auth/me"),
  getUsers: () => request("/auth/users"),
  login: (username, password) => request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request("/auth/logout", { method: "POST" }),
  getPublicItems: () => request("/public/items"),

  getState: () => request("/state"),

  createClient: (data) => request("/clients", { method: "POST", body: JSON.stringify(data) }),
  deleteClient: (id) => request(`/clients/${id}`, { method: "DELETE" }),

  createItem: (data) => request("/items", { method: "POST", body: JSON.stringify(data) }),
  updateItem: (id, patch) => request(`/items/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
  deleteItem: (id) => request(`/items/${id}`, { method: "DELETE" }),
  seedPricelist: () => request("/items/seed-pricelist", { method: "POST" }),

  createReservation: (data) => request("/reservations", { method: "POST", body: JSON.stringify(data) }),
  returnReservation: (id) => request(`/reservations/${id}/return`, { method: "PUT" }),
  setPaymentStatus: (id, paymentStatus) =>
    request(`/reservations/${id}/payment-status`, { method: "PUT", body: JSON.stringify({ paymentStatus }) }),

  createPayment: (data) => request("/payments", { method: "POST", body: JSON.stringify(data) }),
  deletePayment: (id) => request(`/payments/${id}`, { method: "DELETE" }),
};
