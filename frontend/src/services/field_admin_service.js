import { apiRequest } from "./api";

// UC15 ADMIN API. Các API public getFields/availability cũ vẫn giữ nguyên.
const url = (id) => encodeURIComponent(id);
export const getManagedField = (id) =>
  apiRequest(`/api/fields/${url(id)}`);
export const createManagedField = (data) =>
  apiRequest("/api/fields/", {method:"POST", body:JSON.stringify(data)});
export const updateManagedField = (id, data) =>
  apiRequest(`/api/fields/${url(id)}`, {method:"PUT", body:JSON.stringify(data)});
export const setManagedFieldStatus = (id, status) =>
  apiRequest(`/api/fields/${url(id)}/status`, {method:"PATCH",body:JSON.stringify({Status:status})});
export const deleteManagedField = (id) =>
  apiRequest(`/api/fields/${url(id)}`, {method:"DELETE"});
export const addManagedPrice = (id, data) =>
  apiRequest(`/api/fields/${url(id)}/prices`, {method:"POST",body:JSON.stringify(data)});
export const updateManagedPrice = (id, priceId, data) =>
  apiRequest(`/api/fields/${url(id)}/prices/${url(priceId)}`, {method:"PUT",body:JSON.stringify(data)});
export const deleteManagedPrice = (id, priceId) =>
  apiRequest(`/api/fields/${url(id)}/prices/${url(priceId)}`, {method:"DELETE"});
