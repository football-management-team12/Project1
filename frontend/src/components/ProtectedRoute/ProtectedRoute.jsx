import {
  useEffect,
  useState,
} from "react";

import {
  Navigate,
  useLocation,
} from "react-router-dom";

import {
  getCurrentUser,
  getStoredUser,
} from "../../services/auth_service";

import {
  getAccessToken,
} from "../../services/api";


function ProtectedRoute({
  children,
  allowedRoles = null,
}) {

  const location =
    useLocation();


  const [
    user,
    setUser,
  ] = useState(
    getStoredUser
  );


  const [
    checking,
    setChecking,
  ] = useState(
    true
  );


  // =========================================================
  // VERIFY JWT WITH BACKEND
  // =========================================================

  useEffect(() => {

    let active =
      true;


    const verifyAuth =
      async () => {

        const token =
          getAccessToken();

        const storedUser =
          getStoredUser();


        if (
          !token ||
          !storedUser?.UserID
        ) {

          if (active) {

            setUser(null);

            setChecking(
              false
            );
          }

          return;
        }


        try {

          const currentUser =
            await getCurrentUser();


          if (active) {

            setUser(
              currentUser
            );
          }

        } catch {

          if (active) {

            setUser(null);
          }

        } finally {

          if (active) {

            setChecking(
              false
            );
          }
        }
      };


    verifyAuth();


    return () => {

      active =
        false;
    };

  }, [
    location.pathname
  ]);


  // =========================================================
  // VERIFYING
  // =========================================================

  if (checking) {
    return null;
  }


  // =========================================================
  // NOT LOGGED IN
  // =========================================================

  if (
    !user?.UserID ||
    !getAccessToken()
  ) {

    const redirect =
      location.pathname +
      location.search;


    return (
      <Navigate
        to={
          `/login?redirect=${encodeURIComponent(
            redirect
          )}`
        }
        replace
      />
    );
  }


  // =========================================================
  // ROLE
  // =========================================================

  const role =
    String(
      user.Role || ""
    )
      .trim()
      .toUpperCase();


  // =========================================================
  // FORBIDDEN ROLE
  // =========================================================

  if (
    Array.isArray(
      allowedRoles
    ) &&
    allowedRoles.length > 0 &&
    !allowedRoles.includes(
      role
    )
  ) {

    if (
      role === "ADMIN"
    ) {

      return (
        <Navigate
          to="/admin"
          replace
        />
      );
    }


    if (
      role === "STAFF"
    ) {

      return (
        <Navigate
          to="/admin/bookings"
          replace
        />
      );
    }


    return (
      <Navigate
        to="/fields"
        replace
      />
    );
  }


  return children;
}


export default ProtectedRoute;