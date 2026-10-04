import {
  Navigate,
  useLocation,
} from "react-router-dom";


function ProtectedRoute({
  children,
}) {

  const location =
    useLocation();


  let user = null;


  try {

    const rawUser =
      localStorage.getItem(
        "user"
      );


    user =
      rawUser
        ? JSON.parse(rawUser)
        : null;

  } catch {

    user = null;
  }


  // =========================================================
  // CHƯA ĐĂNG NHẬP
  // =========================================================

  if (!user?.UserID) {

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
  // ĐÃ ĐĂNG NHẬP
  // =========================================================

  return children;
}


export default ProtectedRoute;