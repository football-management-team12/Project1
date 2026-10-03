import {
  useEffect,
  useState,
} from "react";

import { Search } from "lucide-react";

import Navbar from "../../components/Navbar/Navbar";
import FieldCard from "../../components/FieldCard/FieldCard";

import field1 from "../../assets/images/football-field.jpg";

import { getFields } from "../../services/field_service";

import "./FieldList.css";


function FieldList() {

  const [fields, setFields] =
    useState([]);

  const [keyword, setKeyword] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");


  /* =========================================
     T123-41 - BE-03
     LOAD DANH SÁCH SÂN TỪ BACKEND
  ========================================= */

  useEffect(() => {

    loadFields();

  }, []);


  const loadFields = async () => {

    try {

      setLoading(true);

      setError("");


      const data =
        await getFields();


      /*
       * Backend trả nhiều dòng cho một sân
       * nếu sân có nhiều khung giá.
       *
       * BE-03 chỉ cần danh sách sân,
       * nên gom theo FieldID.
       */

      const groupedFields = {};


      data.forEach((row) => {

        if (!groupedFields[row.FieldID]) {

          groupedFields[row.FieldID] = {

            id:
              row.FieldID,

            name:
              row.FieldName,

            address:
              row.Location,

            type:
              row.FieldType,

            image:
              row.Image || field1,

            rating:
              4.8,

            price:
              row.Price !== null &&
              row.Price !== undefined
                ? Number(row.Price)
                : 0,

          };

          return;
        }


        /*
         * Nếu có nhiều khung giá
         * thì lấy giá thấp nhất để hiển thị.
         */

        const current =
          groupedFields[row.FieldID];


        const newPrice =
          Number(row.Price);


        if (
          !Number.isNaN(newPrice) &&
          newPrice > 0 &&
          (
            current.price === 0 ||
            newPrice < current.price
          )
        ) {

          current.price =
            newPrice;

        }

      });


      /*
       * Jira T123-41 yêu cầu
       * load tối đa 20 sân.
       */

      const fieldList =
        Object.values(
          groupedFields
        ).slice(
          0,
          20
        );


      setFields(
        fieldList
      );

    }
    catch (err) {

      console.error(
        "Load fields error:",
        err
      );


      setError(
        "Không thể tải danh sách sân bóng."
      );

    }
    finally {

      setLoading(false);

    }

  };


  /*
   * Search này đã có sẵn trong UI cũ.
   * Ta giữ nguyên, không coi đây là
   * chức năng mới của BE-03.
   */

  const filteredFields =
    fields.filter(
      (field) =>
        field.name
          .toLowerCase()
          .includes(
            keyword.toLowerCase()
          )
    );


  return (
    <>
      <Navbar />


      <main className="field-list-page">

        <section className="field-filter-section">

          <div className="field-filter">

            <div className="field-filter__group field-filter__name">

              <label>
                TÊN SÂN BÓNG
              </label>


              <div className="field-filter__input-wrapper">

                <Search size={19} />


                <input
                  type="text"
                  placeholder="Nhập tên sân (vd: Phú Thọ, Tân Bình...)"
                  value={keyword}
                  onChange={(e) =>
                    setKeyword(
                      e.target.value
                    )
                  }
                />

              </div>

            </div>


            <div className="field-filter__group">

              <label>
                KHU VỰC
              </label>


              <select>
                <option>
                  Tất cả quận huyện
                </option>

                <option>
                  Bình Thạnh
                </option>

                <option>
                  Tân Bình
                </option>

                <option>
                  Quận 10
                </option>

                <option>
                  Quận 11
                </option>
              </select>

            </div>


            <div className="field-filter__group">

              <label>
                LOẠI SÂN
              </label>


              <select>
                <option>
                  Sân 7 người
                </option>

                <option>
                  Sân 5 người
                </option>

                <option>
                  Sân 11 người
                </option>
              </select>

            </div>


            <button
              className="field-filter__submit"
            >

              <Search size={18} />

              Tìm sân

            </button>

          </div>

        </section>


        <section className="field-list-container">

          <div className="field-list__heading">

            <div>

              <h1>
                DANH SÁCH SÂN BÓNG
              </h1>


              <p>
                Tìm và đặt sân nhanh chóng,
                tiện lợi, đầy đủ dịch vụ tiện
                ích đi kèm
              </p>

            </div>


            <span className="field-list__result">

              Tìm thấy{" "}
              {
                filteredFields.length
              }{" "}
              kết quả

            </span>

          </div>


          {loading && (

            <p>
              Đang tải danh sách sân...
            </p>

          )}


          {!loading && error && (

            <p>
              {error}
            </p>

          )}


          {
            !loading &&
            !error &&
            filteredFields.length === 0 &&
            (

              <p>
                Không có sân bóng nào.
              </p>

            )
          }


          {
            !loading &&
            !error &&
            filteredFields.length > 0 &&
            (

              <div className="field-list__grid">

                {
                  filteredFields.map(
                    (field) => (

                      <FieldCard
                        key={field.id}
                        id={field.id}
                        image={field.image}
                        name={field.name}
                        address={field.address}
                        type={field.type}
                        rating={field.rating}
                        price={field.price}
                      />

                    )
                  )
                }

              </div>

            )
          }

        </section>

      </main>

    </>
  );
}


export default FieldList;