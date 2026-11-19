import { apiRequest } from "./api";

// A running backend may still return the earlier flat UC08 response.
// Normalize at the API boundary without recalculating any monetary values.
const normalizeInvoice = (invoice) => {
  if (!invoice) return null;
  return {
    ...invoice,
    paymentStatus: invoice.paymentStatus ?? invoice.status ?? "UNKNOWN",
    field: {
      fieldId: invoice.field?.fieldId ?? invoice.fieldId ?? null,
      fieldName: invoice.field?.fieldName ?? invoice.fieldName ?? null,
      fieldType: invoice.field?.fieldType ?? invoice.fieldType ?? null,
      location: invoice.field?.location ?? invoice.location ?? null,
    },
  };
};

export const getInvoice = (invoiceId) =>
  apiRequest(`/api/invoices/${encodeURIComponent(invoiceId)}`).then(normalizeInvoice);

export const getBookingInvoice = (bookingId) =>
  apiRequest(`/api/bookings/${encodeURIComponent(bookingId)}/invoice`).then(normalizeInvoice);
