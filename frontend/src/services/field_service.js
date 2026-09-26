import axios from "axios";


export const getFields = async()=>{

    const response = await axios.get(
        "http://127.0.0.1:5000/api/fields"
    );


    return response.data;

}


export const updateFieldPrice = async(
    fieldID,
    data
)=>{


const response = await fetch(
`http://127.0.0.1:5000/api/fields/price/${fieldID}`,
{

method:"PUT",

headers:{
"Content-Type":"application/json"
},


body:JSON.stringify(data)


}

);


return await response.json();


}