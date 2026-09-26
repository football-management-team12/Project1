import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import Navbar from "../../components/Navbar/Navbar";
import FieldCard from "../../components/FieldCard/FieldCard";

import { getFields } from "../../services/field_service";

import "./FieldList.css";


function FieldList() {

  const [fields, setFields] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [fieldType, setFieldType] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);


  // =========================================================
  // LOAD FIELDS
  // =========================================================

  useEffect(() => {
    loadFields();
  }, []);


  const loadFields = async () => {

    try {

      setLoading(true);

      const data = await getFields();


      // Gom nhiều dòng giá thành 1 sân
      const groupedFields = Object.values(

        data.reduce((result, row) => {

          // Nếu sân chưa tồn tại thì tạo
          if (!result[row.FieldID]) {

            result[row.FieldID] = {

              FieldID: row.FieldID,

              FieldName: row.FieldName,

              FieldType: row.FieldType,

              Location: row.Location,

              Status: row.Status,

              prices: []
            };
          }


          // Thêm từng khung giờ vào sân
          if (row.PriceID) {

            result[row.FieldID].prices.push({

              PriceID: row.PriceID,

              StartTime:
                row.StartTime?.slice(0, 5),

              EndTime:
                row.EndTime?.slice(0, 5),

              Price:
                Number(row.Price || 0),

              available:
                row.IsAvailable !== undefined
                  ? row.IsAvailable
                  : row.Status === "AVAILABLE"
            });
          }


          return result;

        }, {})
      );


      setFields(groupedFields);

    } catch (error) {

      console.error(error);

      alert(
        "Không thể tải danh sách sân bóng"
      );

    } finally {

      setLoading(false);
    }
  };


  // =========================================================
  // LOCATION LIST
  // =========================================================

  const locations = useMemo(() => {

    return [
      ...new Set(
        fields
          .map(field => field.Location)
          .filter(Boolean)
      )
    ];

  }, [fields]);


  // =========================================================
  // FIELD TYPE LIST
  // =========================================================

  const fieldTypes = useMemo(() => {

    return [
      ...new Set(
        fields
          .map(field => field.FieldType)
          .filter(Boolean)
      )
    ];

  }, [fields]);


  // =========================================================
  // FILTER
  // =========================================================

  const filteredFields = useMemo(() => {

    return fields.filter(field => {

      const matchKeyword =
        (field.FieldName || "")
          .toLowerCase()
          .includes(
            keyword
              .trim()
              .toLowerCase()
          );


      const matchLocation =
        !location ||
        field.Location === location;


      const matchType =
        !fieldType ||
        field.FieldType === fieldType;


      return (
        matchKeyword &&
        matchLocation &&
        matchType
      );
    });

  }, [
    fields,
    keyword,
    location,
    fieldType
  ]);


  return (

    <>

      <Navbar />


      <main className="field-list-page">


        {/* =====================================================
            FILTER
        ====================================================== */}

        <section className="field-filter-section">

          <div className="field-filter">


            {/* SEARCH */}

            <div className="field-filter__group field-filter__name">

              <label>
                TÊN SÂN BÓNG
              </label>


              <div className="field-filter__input-wrapper">

                <Search size={19} />


                <input
                  type="text"
                  placeholder="Nhập tên sân..."
                  value={keyword}
                  onChange={e =>
                    setKeyword(
                      e.target.value
                    )
                  }
                />

              </div>

            </div>


            {/* LOCATION */}

            <div className="field-filter__group">

              <label>
                KHU VỰC
              </label>


              <select
                value={location}
                onChange={e =>
                  setLocation(
                    e.target.value
                  )
                }
              >

                <option value="">
                  Tất cả khu vực
                </option>


                {
                  locations.map(item => (

                    <option
                      key={item}
                      value={item}
                    >
                      {item}
                    </option>

                  ))
                }

              </select>

            </div>


            {/* FIELD TYPE */}

            <div className="field-filter__group">

              <label>
                LOẠI SÂN
              </label>


              <select
                value={fieldType}
                onChange={e =>
                  setFieldType(
                    e.target.value
                  )
                }
              >

                <option value="">
                  Tất cả loại sân
                </option>


                {
                  fieldTypes.map(type => (

                    <option
                      key={type}
                      value={type}
                    >
                      {type}
                    </option>

                  ))
                }

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


        {/* =====================================================
            FIELD LIST
        ====================================================== */}

        <section className="field-list-container">


          <div className="field-list__heading">

            <div>

              <h1>
                DANH SÁCH SÂN BÓNG
              </h1>

              <p>
                Chọn sân và khung giờ phù hợp
              </p>

            </div>


            <span className="field-list__result">

              Tìm thấy{" "}
              {filteredFields.length}
              {" "}sân

            </span>

          </div>


          {/* LOADING */}

          {
            loading ? (

              <div className="field-list__empty">

                <h2>
                  Đang tải sân bóng...
                </h2>

              </div>

            ) : filteredFields.length === 0 ? (

              // EMPTY

              <div className="field-list__empty">

                <h2>
                  Không tìm thấy sân
                </h2>

                <p>
                  Hãy thử thay đổi bộ lọc
                </p>

              </div>

            ) : (

              // FIELD CARDS

              <div className="field-list__grid">

                {
                  filteredFields.map(field => (

                    <FieldCard

                      key={
                        field.FieldID
                      }

                      id={
                        field.FieldID
                      }

                      name={
                        field.FieldName
                      }

                      address={
                        field.Location
                      }

                      type={
                        field.FieldType
                      }

                      status={
                        field.Status
                      }

                      slots={
                        field.prices
                      }

                    />

                  ))
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