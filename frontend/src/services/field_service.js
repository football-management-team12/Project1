import {
  apiRequest,
} from "./api";


// ============================================================
// BE-03
// GET ALL FIELDS
//
// PUBLIC
// ============================================================

export const getFields =
  async () => {

    return apiRequest(
      "/api/fields/",
      {
        method:
          "GET",

        auth:
          false,
      }
    );
  };


// ============================================================
// BE-05
// GET AVAILABILITY ONE FIELD
//
// PUBLIC
// ============================================================

export const getFieldAvailability =
  async (
    fieldID,
    date
  ) => {

    const params =
      new URLSearchParams({
        date,
      });


    return apiRequest(
      `/api/fields/${encodeURIComponent(
        fieldID
      )}/availability?${params.toString()}`,
      {
        method:
          "GET",

        auth:
          false,
      }
    );
  };


// ============================================================
// BE-05.1
// GET ALL FIELD AVAILABILITY
//
// PUBLIC
// ============================================================

export const getAllFieldsAvailability =
  async (
    date
  ) => {

    const params =
      new URLSearchParams({
        date,
      });


    return apiRequest(
      `/api/fields/availability?${params.toString()}`,
      {
        method:
          "GET",

        auth:
          false,
      }
    );
  };


// ============================================================
// UPDATE FIELD PRICE
//
// JWT required
// ADMIN only
// ============================================================

export const updateFieldPrice =
  async (
    fieldID,
    data
  ) => {

    return apiRequest(
      `/api/fields/price/${encodeURIComponent(
        fieldID
      )}`,
      {
        method:
          "PUT",

        body:
          JSON.stringify(
            data
          ),
      }
    );
  };