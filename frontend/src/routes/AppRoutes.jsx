import { Routes, Route } from "react-router-dom";

import Home from "../pages/Home/Home";
import Login from "../pages/Login/Login";
import Register from "../pages/Register/Register";
import FieldList from "../pages/FieldList/FieldList";
import FieldDetail from "../pages/FieldDetail/FieldDetail";
import Booking from "../pages/Booking/Booking";
import Pricing from "../pages/Pricing/Pricing";
import About from "../pages/About/About";
import Admin from "../pages/Admin/Admin";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      <Route path="/login" element={<Login />} />

      <Route path="/register" element={<Register />} />

      <Route path="/fields" element={<FieldList />} />

      <Route path="/fields/:id" element={<FieldDetail />} />

      <Route path="/booking" element={<Booking />} />

      <Route path="/pricing" element={<Pricing />} />

      <Route path="/about" element={<About />} />

      <Route path="/admin" element={<Admin />} />
    </Routes>
  );
}

export default AppRoutes;