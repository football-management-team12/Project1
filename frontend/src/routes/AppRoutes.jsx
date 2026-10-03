import {
  Routes,
  Route,
} from "react-router-dom";

import Home
  from "../pages/Home/Home";

import Login
  from "../pages/Login/Login";

import Register
  from "../pages/Register/Register";

import FieldList
  from "../pages/FieldList/FieldList";

import Admin
  from "../pages/Admin/Admin";

import About
  from "../pages/About/About";

import Booking
  from "../pages/Booking/Booking";

import BookingConfirm
  from "../pages/BookingConfirm/BookingConfirm";

import Pricing
  from "../pages/Pricing/Pricing";

import ProtectedRoute
  from "../components/ProtectedRoute/ProtectedRoute";


function AppRoutes() {
  return (
    <Routes>

      <Route
        path="/"
        element={<Home />}
      />


      <Route
        path="/login"
        element={<Login />}
      />


      <Route
        path="/register"
        element={<Register />}
      />


      <Route
        path="/fields"
        element={<FieldList />}
      />


      <Route
        path="/booking"
        element={
          <ProtectedRoute>
            <Booking />
          </ProtectedRoute>
        }
      />


      <Route
        path="/booking/confirm"
        element={
          <ProtectedRoute>
            <BookingConfirm />
          </ProtectedRoute>
        }
      />


      <Route
        path="/pricing"
        element={<Pricing />}
      />


      <Route
        path="/about"
        element={<About />}
      />


      <Route
        path="/admin"
        element={<Admin />}
      />

    </Routes>
  );
}


export default AppRoutes;