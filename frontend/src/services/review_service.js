import { apiRequest } from "./api";

export const getBookingReview = (bookingId, options = {}) =>
  apiRequest(`/api/bookings/${encodeURIComponent(bookingId)}/reviews`, options);

export const submitBookingReview = (bookingId, rating, comment) =>
  apiRequest(`/api/bookings/${encodeURIComponent(bookingId)}/reviews`, {
    method: "POST", body: JSON.stringify({ rating, comment }),
  });

export const getFieldReviews = (fieldId, page = 1, options = {}) =>
  apiRequest(`/api/fields/${encodeURIComponent(fieldId)}/reviews?page=${page}&pageSize=10`, {
    ...options, auth: false,
  });
