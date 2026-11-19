import { apiRequest } from "./api";

export const listCustomers = (filters, options = {}) => {
  const query = new URLSearchParams({ page: 1, pageSize: 10, ...filters });
  return apiRequest(`/api/admin/customers?${query}`, options);
};
export const getCustomer = (id, options = {}) => apiRequest(`/api/admin/customers/${encodeURIComponent(id)}`, options);
export const getCustomerBookings = (id, page = 1, options = {}) =>
  apiRequest(`/api/admin/customers/${encodeURIComponent(id)}/bookings?page=${page}&pageSize=10`, options);
export const updateCustomer = (id, changes) => apiRequest(`/api/admin/customers/${encodeURIComponent(id)}`, {
  method: "PUT", body: JSON.stringify(changes),
});
