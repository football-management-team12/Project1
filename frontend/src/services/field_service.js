import axios from "axios";


export const getFields = async () => {

    const response = await axios.get(
        "http://127.0.0.1:5000/api/fields"
    );

    return response.data.data;
};

