import { Routes, Route } from "react-router-dom";

import Home from "../pages/Home/Home";

function Login() {
  return <h1>Login Page</h1>;
}

function Register() {
  return <h1>Register Page</h1>;
}

function Fields() {
  return <h1>Fields Page</h1>;
}

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

      <Route path="/fields" element={<Fields />} />

      <Route path="/booking" element={<Booking />} />

      <Route path="/admin" element={<Admin />} />
    </Routes>
  );
}

export default AppRoutes;