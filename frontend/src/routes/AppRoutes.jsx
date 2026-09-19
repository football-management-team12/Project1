import { Routes, Route } from "react-router-dom";

import Home from "../pages/Home/Home";
import Login from "../pages/Login/Login";
import Register from "../pages/Register/Register";
import FieldList from "../pages/FieldList/FieldList";

function Booking() {
  return <h1>Booking Page</h1>;
}

function Admin() {
  return <h1>Admin Page</h1>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      <Route path="/login" element={<Login />} />

      <Route path="/register" element={<Register />} />

      <Route path="/fields" element={<FieldList />} />

      <Route path="/booking" element={<Booking />} />

      <Route path="/admin" element={<Admin />} />
    </Routes>
  );
}

export default AppRoutes;