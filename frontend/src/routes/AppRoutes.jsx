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

import Profile
  from "../pages/Profile/Profile";

import ProtectedRoute
  from "../components/ProtectedRoute/ProtectedRoute";


function AppRoutes() {

  return (

    <Routes>


      {/* =====================================================
          PUBLIC
      ====================================================== */}

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


      {/* =====================================================
          AUTHENTICATED USER
      ====================================================== */}

      <Route
        path="/profile"
        element={

          <ProtectedRoute>

            <Profile />

          </ProtectedRoute>
        }
      />


      {/* =====================================================
          CUSTOMER
      ====================================================== */}

      <Route
        path="/booking"
        element={

          <ProtectedRoute
            allowedRoles={[
              "CUSTOMER"
            ]}
          >

            <Booking />

          </ProtectedRoute>
        }
      />


      <Route
        path="/booking/confirm"
        element={

          <ProtectedRoute
            allowedRoles={[
              "CUSTOMER"
            ]}
          >

            <BookingConfirm />

          </ProtectedRoute>
        }
      />


      <Route
        path="/bookings"
        element={

          <ProtectedRoute
            allowedRoles={[
              "CUSTOMER"
            ]}
          >

            <BookingHistory />

          </ProtectedRoute>
        }
      />


      <Route
        path="/bookings/:bookingId"
        element={

          <ProtectedRoute
            allowedRoles={[
              "CUSTOMER"
            ]}
          >

            <BookingDetail />

          </ProtectedRoute>
        }
      />


      {/* =====================================================
          ADMIN
          Giữ nguyên scope hiện tại của source.
      ====================================================== */}

      <Route
        path="/admin"
        element={

          <ProtectedRoute
            allowedRoles={[
              "ADMIN",
              "STAFF",
            ]}
          >

            <AdminLayout />

          </ProtectedRoute>
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