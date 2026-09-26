import axios from "axios";
const API_URL = import.meta.env.VITE_API_URL;

export const getFields = async () => {

    const response = await axios.get(
        `${API_URL}/api/fields`
    );


    return response.data;

}


export const updateFieldPrice = async (
    fieldID,
    data
) => {


    const response = await fetch(

        `${API_URL}/api/fields/price/${fieldID}`,

        {

            method: "PUT",

            headers: {
                "Content-Type": "application/json"
            },


            body: JSON.stringify(data)


        }

    );


    return await response.json();


}