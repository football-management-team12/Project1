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

import FieldManagement
  from "../pages/Admin/FieldManagement";

import BookingManagement
  from "../pages/Admin/BookingManagement";

import AdminLayout
  from "../components/AdminLayout/AdminLayout";

import About
  from "../pages/About/About";

import Booking
  from "../pages/Booking/Booking";

import BookingConfirm
  from "../pages/BookingConfirm/BookingConfirm";

import BookingHistory
  from "../pages/BookingHistory/BookingHistory";

import BookingDetail
  from "../pages/BookingDetail/BookingDetail";

import Pricing
  from "../pages/Pricing/Pricing";

import ProtectedRoute
  from "../components/ProtectedRoute/ProtectedRoute";


function AppRoutes() {

  return (

    <Routes>

      <Route
        path="/"
        element={
          <Home />
        }
      />


      <Route
        path="/login"
        element={
          <Login />
        }
      />


      <Route
        path="/register"
        element={
          <Register />
        }
      />


      <Route
        path="/fields"
        element={
          <FieldList />
        }
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
        path="/bookings"
        element={
          <ProtectedRoute>

            <BookingHistory />

          </ProtectedRoute>
        }
      />


      <Route
        path="/bookings/:bookingId"
        element={
          <ProtectedRoute>

            <BookingDetail />

          </ProtectedRoute>
        }
      />


      <Route
        path="/pricing"
        element={
          <Pricing />
        }
      />


      <Route
        path="/about"
        element={
          <About />
        }
      />


      <Route
        path="/admin"
        element={
          <AdminLayout />
        }
      >

        <Route
          index
          element={
            <Admin />
          }
        />


        <Route
          path="fields"
          element={
            <FieldManagement />
          }
        />


        <Route
          path="bookings"
          element={
            <BookingManagement />
          }
        />

      </Route>

    </Routes>

  );

}


export default AppRoutes;