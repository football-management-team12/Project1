// In development, use Vite's same-origin /api proxy to avoid browser CORS
// preflight requests. Production can still use an explicitly configured API URL.
const API_BASE_URL = (
  import.meta.env.DEV
    ? ""
    : import.meta.env.VITE_API_URL || ""
).replace(/\/$/, "");

const ACCESS_TOKEN_KEY =
  "accessToken";

const USER_KEY =
  "user";


export const getAccessToken = () =>
  localStorage.getItem(
    ACCESS_TOKEN_KEY
  );


export const clearAuthStorage = () => {
  localStorage.removeItem(
    ACCESS_TOKEN_KEY
  );

  localStorage.removeItem(
    USER_KEY
  );

  window.dispatchEvent(
    new Event(
      "auth-changed"
    )
  );
};


const redirectToLogin = () => {
  if (
    window.location.pathname ===
    "/login"
  ) {
    return;
  }

  const redirect =
    window.location.pathname +
    window.location.search;

  window.location.replace(
    `/login?redirect=${encodeURIComponent(
      redirect
    )}`
  );
};


export const apiRequest = async (
  path,
  options = {}
) => {
  const {
    auth = true,
    redirectOnUnauthorized = true,
    headers = {},
    ...fetchOptions
  } = options;

  const requestHeaders =
    new Headers(
      headers
    );


  // =========================================================
  // ADD JWT
  // =========================================================

  if (auth) {
    const token =
      getAccessToken();

    if (token) {
      requestHeaders.set(
        "Authorization",
        `Bearer ${token}`
      );
    }
  }


  // =========================================================
  // JSON CONTENT TYPE
  // =========================================================

  if (
    fetchOptions.body &&
    !(
      fetchOptions.body
      instanceof FormData
    ) &&
    !requestHeaders.has(
      "Content-Type"
    )
  ) {
    requestHeaders.set(
      "Content-Type",
      "application/json"
    );
  }


  // =========================================================
  // REQUEST
  // =========================================================

  const response =
    await fetch(
      `${API_BASE_URL}${path}`,
      {
        ...fetchOptions,

        headers:
          requestHeaders,
      }
    );


  let data = null;

  try {
    data =
      await response.json();
  } catch {
    data = null;
  }


  // =========================================================
  // TOKEN INVALID / EXPIRED
  // =========================================================

  if (
    response.status === 401 &&
    auth
  ) {
    clearAuthStorage();

    if (
      redirectOnUnauthorized
    ) {
      redirectToLogin();
    }
  }


  // =========================================================
  // API ERROR
  // =========================================================

  if (!response.ok) {
    const error =
      new Error(
        data?.message ||
        data?.error ||
        `API lỗi HTTP ${response.status}`
      );

    error.status =
      response.status;

    error.code =
      data?.code;

    error.data =
      data;

    throw error;
  }


  return data;
};


export {
  API_BASE_URL
};
