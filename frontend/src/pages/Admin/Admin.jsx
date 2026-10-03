import { useEffect, useState } from "react";
import {
    getFields,
    updateFieldPrice
} from "../../services/field_service";

import "./Admin.css";


function Admin(){


const [user,setUser]=useState(null);

const [fields,setFields]=useState([]);

const [editField,setEditField]=useState(null);



useEffect(()=>{


const userData=localStorage.getItem("user");


if(userData){

setUser(
JSON.parse(userData)
);

}


loadFields();


},[]);





const loadFields=async()=>{


try{


const data=await getFields();

setFields(data);


}
catch(err){

console.log(err);

}


};





// đếm sân không trùng

const totalFields=
new Set(
fields.map(
f=>f.FieldID
)
).size;



const activeFields=
new Set(
fields
.filter(
f=>f.Status==="AVAILABLE"
)
.map(
f=>f.FieldID
)
).size;



const maintenanceFields=
new Set(
fields
.filter(
f=>f.Status!=="AVAILABLE"
)
.map(
f=>f.FieldID
)
).size;





return (


<div className="admin-container">



{/* SIDEBAR */}

<aside className="sidebar">


<h2>
⚽ SÂN BÓNG
</h2>



<ul>


<li>
Tổng quan
</li>


<li className="active">
Quản lý sân bóng
</li>


<li>
Quản lý đặt sân
</li>


<li>
Quản lý khách hàng
</li>


<li>
Quản lý nhân viên
</li>


<li>
Hóa đơn & thanh toán
</li>


<li>
Thống kê & báo cáo
</li>


<li>
Cài đặt
</li>


</ul>



<div className="logout">

↪ Đăng xuất

</div>


</aside>






{/* MAIN */}


<main className="admin-content">





{/* HEADER */}

<div className="top-header">


<input
placeholder="🔍 Tìm kiếm nhanh..."
/>



<div className="admin-user">


<span>
🔔
</span>


<div>

<b>
{
user?.FullName || "Admin sân bóng"
}
</b>


<small>
Quản trị viên
</small>


</div>


</div>


</div>







<div className="title-row">


<h1>
QUẢN LÝ SÂN BÓNG
</h1>



<button className="add-btn">

+ Thêm sân mới

</button>



</div>









{/* CARD */}


<div className="cards">


<div className="card">

<p>
Tổng số sân
</p>


<h2>
{totalFields}
</h2>


</div>



<div className="card">

<p>
Đang hoạt động
</p>


<h2>
{activeFields}
</h2>


</div>



<div className="card">

<p>
Đang bảo trì
</p>


<h2>
{maintenanceFields}
</h2>


</div>




<div className="card">

<p>
Đã đặt hôm nay
</p>


<h2>
0
</h2>


</div>



</div>









{/* FILTER */}

<div className="filter">


<input
placeholder="🔍 Tìm kiếm tên sân..."
/>


<select>

<option>
Loại sân
</option>

<option>
5 player
</option>

<option>
7 player
</option>


<option>
11 player
</option>

</select>




<select>

<option>
Trạng thái
</option>


<option>
AVAILABLE
</option>


<option>
MAINTENANCE
</option>


</select>


</div>









{/* TABLE */}


<div className="table-box">


<table>


<thead>


<tr>


<th>
Tên sân
</th>


<th>
Loại sân
</th>


<th>
Địa điểm
</th>


<th>
Khung giờ
</th>


<th>
Giá / giờ
</th>


<th>
Trạng thái
</th>


<th>
Thao tác
</th>


</tr>


</thead>






<tbody>


{

fields.map(
(field)=>(


<tr
key={
field.FieldID+"-"+field.StartTime
}
>



<td>
{field.FieldName}
</td>



<td>
{field.FieldType}
</td>



<td>
{field.Location}
</td>





<td>


<div className="time">


{field.StartTime}

-

{field.EndTime}


</div>



</td>






<td>


<strong>

{
field.Price
?
field.Price.toLocaleString()
:
0
}

đ

</strong>



</td>






<td>


<span

className={
field.Status==="AVAILABLE"
?
"status available"
:
"status maintenance"
}

>

{field.Status}


</span>


</td>






<td>


<button

className="edit-btn"

onClick={()=>setEditField(field)}

>

Sửa

</button>



</td>






</tr>


)

)


}



</tbody>



</table>



</div>









</main>









{/* POPUP EDIT */}



{

editField &&


<div className="modal">


<div className="modal-content">


<h2>
Sửa giá sân
</h2>



<label>
Giờ bắt đầu
</label>


<input

type="time"

value={
editField.StartTime
}


onChange={
e=>

setEditField({

...editField,

StartTime:e.target.value

})

}


/>






<label>
Giờ kết thúc
</label>


<input

type="time"

value={
editField.EndTime
}


onChange={
e=>

setEditField({

...editField,

EndTime:e.target.value

})

}


/>





<label>
Giá tiền
</label>



<input

type="number"

value={
editField.Price
}


onChange={
e=>

setEditField({

...editField,

Price:e.target.value

})

}


/>





<button

className="save-btn"


onClick={async()=>{


await updateFieldPrice(

editField.FieldID,

{

StartTime:editField.StartTime,

EndTime:editField.EndTime,

Price:Number(editField.Price)

}

);



setEditField(null);


loadFields();


}}


>

Lưu thay đổi

</button>





<button

className="cancel-btn"

onClick={
()=>setEditField(null)
}

>

Hủy

</button>





</div>


</div>


}



</div>


)


}


export default Admin;