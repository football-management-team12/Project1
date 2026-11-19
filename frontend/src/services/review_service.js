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

export const getAdminReviews = ({ page = 1, pageSize = 10, status = "all", rating = "" } = {}, options = {}) => {
  const query = new URLSearchParams({ page, pageSize, status });
  if (rating) query.set("rating", rating);
  return apiRequest(`/api/admin/reviews?${query}`, options);
};

export const saveReviewReply = (reviewId, comment) =>
  apiRequest(`/api/admin/reviews/${encodeURIComponent(reviewId)}/reply`, {
    method: "PUT", body: JSON.stringify({ comment }),
  });
