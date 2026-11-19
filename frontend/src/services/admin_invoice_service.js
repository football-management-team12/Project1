import { apiRequest } from "./api";

export const listAdminInvoices = (filters, signal) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== "") params.set(key, String(value));
  });
  return apiRequest(`/api/admin/invoices?${params}`, { signal });
};
export const getAdminInvoice = (id, signal) =>
  apiRequest(`/api/admin/invoices/${encodeURIComponent(id)}`, { signal });

export const cancelAdminInvoice = (id, reason) =>
  apiRequest(`/api/admin/invoices/${encodeURIComponent(id)}/status`, {
    method: "PATCH", body: JSON.stringify({ status: "CANCELLED", reason }),
  });
