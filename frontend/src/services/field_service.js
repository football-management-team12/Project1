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

export const createField = async (data) => {

    const response = await fetch(
        "http://127.0.0.1:5000/api/fields/",
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(data)
        }
    );


    const result = await response.json();


    if (!response.ok) {

        throw new Error(
            result.message ||
            "Không thể thêm sân"
        );
    }


    return result;
};