import Navbar from "../components/Navbar";
import FieldCard from "../components/FieldCard";
import "../css/Home.css";
import Footer from "../components/Footer";

function Home(){


const fields=[
"Sân bóng ABC",
"Sân bóng XYZ",
"Sân bóng 789"
];


return(

<div>


<Navbar/>


{/* HERO */}

<section className="hero">


<div>

<h1>
Đặt sân bóng dễ dàng
<br/>
Trải nghiệm tuyệt vời
</h1>


<button>
Đặt sân ngay
</button>


</div>


</section>



{/* WHY */}

<section className="why">


<h2>
Tại sao lại chọn chúng tôi?
</h2>


<div className="feature-box">


<div>

<div className="circle"></div>

<h3>
Sân chất lượng
</h3>

<p>
Sân đạt chuẩn, sạch đẹp
</p>

</div>



<div>

<div className="circle"></div>

<h3>
Giá cả hợp lý
</h3>

<p>
Chi phí phù hợp
</p>

</div>



<div>

<div className="circle"></div>

<h3>
Đặt sân nhanh chóng
</h3>

<p>
Nhanh và tiện lợi
</p>

</div>


</div>


</section>



{/* FIELD */}

<section className="fields">


<h2>
Các sân bóng nổi bật
</h2>


<div className="field-list">


{
fields.map(
(item,index)=>(

<FieldCard
key={index}
name={item}
/>

)

)
}


</div>


</section>



{/* STEPS */}

<section className="steps">


<h2>
4 bước đặt sân đơn giản
</h2>


<div className="step-list">


<div>
<span>1</span>
<p>Chọn sân</p>
</div>


<div>
<span>2</span>
<p>Chọn thời gian</p>
</div>


<div>
<span>3</span>
<p>Xác nhận</p>
</div>


<div>
<span>4</span>
<p>Thanh toán</p>
</div>


</div>


</section>


<Footer/>

</div>

)

}

export default Home;