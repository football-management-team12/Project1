import "../css/Navbar.css";


function Navbar(){

return(

<header className="navbar">


<div className="logo">
Sân bóng
</div>


<nav>

<a>Trang chủ</a>
<a>Sân bóng</a>
<a>Lịch đặt</a>
<a>Bảng giá</a>
<a>Liên hệ</a>

</nav>


<div className="right-menu">

<input 
placeholder="Tìm kiếm sân bóng"
/>


<button>
Đăng nhập
</button>


<button className="register">
Đăng ký
</button>


</div>


</header>

)

}

export default Navbar;