import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  CalendarDays,
  Search
} from "lucide-react";

import Navbar
  from "../../components/Navbar/Navbar";

import FieldCard
  from "../../components/FieldCard/FieldCard";

import {
  getFields,
  getFieldAvailability
} from "../../services/field_service";

import "./FieldList.css";


/* =========================================================
   GET TODAY LOCAL DATE
========================================================= */

const getToday = () => {

  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
};


function FieldList() {

  const [fields, setFields] =
    useState([]);

  const [keyword, setKeyword] =
    useState("");

  const [fieldType, setFieldType] =
    useState("");

  const [location, setLocation] =
    useState("");

  const [selectedDate, setSelectedDate] =
    useState(
      getToday()
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");


  /* =========================================================
     INITIAL LOAD
  ========================================================= */

  useEffect(() => {

    loadFields(
      selectedDate
    );

  }, []);


  /* =========================================================
     LOAD FIELDS + AVAILABILITY
  ========================================================= */

  const loadFields = async (
    date = selectedDate
  ) => {

    try {

      setLoading(true);

      setError("");


      /* -----------------------------------------
         GET RAW FIELD DATA
      ----------------------------------------- */

      const data =
        await getFields();


      /* -----------------------------------------
         GROUP BY FIELD ID

         Backend:
         Field 1 + Price 1
         Field 1 + Price 2
         Field 1 + Price 3

         Frontend:
         Field 1 {
             prices: [...]
         }
      ----------------------------------------- */

      const grouped =
        Object.values(

          data.reduce(
            (
              result,
              row
            ) => {

              if (
                !result[
                  row.FieldID
                ]
              ) {

                result[
                  row.FieldID
                ] = {

                  FieldID:
                    row.FieldID,

                  FieldName:
                    row.FieldName,

                  FieldType:
                    row.FieldType,

                  Location:
                    row.Location,

                  Status:
                    row.Status,

                  prices: []
                };
              }


              if (
                row.PriceID
                !== null
                &&
                row.PriceID
                !== undefined
              ) {

                result[
                  row.FieldID
                ].prices.push({

                  PriceID:
                    row.PriceID,

                  StartTime:
                    row.StartTime
                      ?.slice(
                        0,
                        5
                      ),

                  EndTime:
                    row.EndTime
                      ?.slice(
                        0,
                        5
                      ),

                  Price:
                    Number(
                      row.Price ||
                      0
                    ),

                  available:
                    row.Status
                    ===
                    "AVAILABLE",

                  reason:
                    null
                });
              }


              return result;

            },
            {}
          )
        );


      /* -----------------------------------------
         BE-05

         Call availability for EACH field
      ----------------------------------------- */

      const fieldsWithAvailability =
        await Promise.all(

          grouped.map(
            async field => {

              try {

                const availability =
                  await getFieldAvailability(
                    field.FieldID,
                    date
                  );


                return {

                  ...field,

                  Status:
                    availability
                      .FieldStatus,

                  FieldAvailable:
                    availability
                      .FieldAvailable,

                  AvailableCount:
                    availability
                      .AvailableCount,

                  UnavailableCount:
                    availability
                      .UnavailableCount,

                  prices:
                    availability
                      .Slots ||
                    []
                };

              } catch (
                availabilityError
              ) {

                console.error(
                  `Availability field ${field.FieldID}:`,
                  availabilityError
                );


                /*
                  Nếu API availability
                  của một sân lỗi,
                  vẫn hiển thị sân đó.
                */

                return {

                  ...field,

                  FieldAvailable:
                    field.Status
                    ===
                    "AVAILABLE",

                  AvailableCount:
                    field.prices.length,

                  UnavailableCount:
                    0
                };
              }
            }
          )
        );


      setFields(
        fieldsWithAvailability
      );

    } catch (error) {

      console.error(error);

      setError(
        error.message ||
        "Không thể tải danh sách sân bóng"
      );

    } finally {

      setLoading(false);
    }
  };


  /* =========================================================
     CHANGE DATE
  ========================================================= */

  const handleDateChange = async (
    event
  ) => {

    const newDate =
      event.target.value;


    setSelectedDate(
      newDate
    );


    if (
      newDate
    ) {

      await loadFields(
        newDate
      );
    }
  };


  /* =========================================================
     SEARCH BUTTON
  ========================================================= */

  const handleSearch = () => {

    loadFields(
      selectedDate
    );
  };


  /* =========================================================
     LOCATION OPTIONS
  ========================================================= */

  const locations =
    useMemo(
      () => {

        return [
          ...new Set(

            fields
              .map(
                field =>
                  field.Location
              )
              .filter(
                Boolean
              )
          )
        ];

      },
      [fields]
    );


  /* =========================================================
     FIELD TYPE OPTIONS
  ========================================================= */

  const fieldTypes =
    useMemo(
      () => {

        return [
          ...new Set(

            fields
              .map(
                field =>
                  field.FieldType
              )
              .filter(
                Boolean
              )
          )
        ];

      },
      [fields]
    );


  /* =========================================================
     FILTER
  ========================================================= */

  const filteredFields =
    useMemo(
      () => {

        return fields.filter(
          field => {

            const fieldName =
              String(
                field.FieldName ||
                ""
              )
                .toLowerCase();


            const matchKeyword =
              fieldName.includes(
                keyword
                  .trim()
                  .toLowerCase()
              );


            const matchLocation =
              !location ||
              field.Location
              ===
              location;


            const matchType =
              !fieldType ||
              field.FieldType
              ===
              fieldType;


            return (
              matchKeyword
              &&
              matchLocation
              &&
              matchType
            );
          }
        );

      },
      [
        fields,
        keyword,
        location,
        fieldType
      ]
    );


  /* =========================================================
     JSX
  ========================================================= */

  return (

    <>

      <Navbar />


      <main
        className="field-list-page"
      >


        {/* =================================================
            FILTER
        ================================================= */}

        <section
          className="field-filter-section"
        >

          <div
            className="field-filter"
          >


            {/* SEARCH NAME */}

            <div
              className="
                field-filter__group
                field-filter__name
              "
            >

              <label>
                TÊN SÂN BÓNG
              </label>


              <div
                className="
                  field-filter__input-wrapper
                "
              >

                <Search
                  size={18}
                />


                <input

                  type="text"

                  placeholder="Nhập tên sân..."

                  value={
                    keyword
                  }

                  onChange={
                    event =>
                      setKeyword(
                        event.target.value
                      )
                  }

                />

              </div>

            </div>


            {/* DATE */}

            <div
              className="
                field-filter__group
              "
            >

              <label>
                NGÀY ĐẶT
              </label>


              <div
                className="
                  field-filter__input-wrapper
                  field-filter__date
                "
              >

                <CalendarDays
                  size={18}
                />


                <input

                  type="date"

                  value={
                    selectedDate
                  }

                  min={
                    getToday()
                  }

                  onChange={
                    handleDateChange
                  }

                />

              </div>

            </div>


            {/* LOCATION */}

            <div
              className="
                field-filter__group
              "
            >

              <label>
                KHU VỰC
              </label>


              <select

                value={
                  location
                }

                onChange={
                  event =>
                    setLocation(
                      event.target.value
                    )
                }

              >

                <option value="">
                  Tất cả khu vực
                </option>


                {
                  locations.map(
                    item => (

                      <option
                        key={
                          item
                        }
                        value={
                          item
                        }
                      >

                        {item}

                      </option>

                    )
                  )
                }

              </select>

            </div>


            {/* TYPE */}

            <div
              className="
                field-filter__group
              "
            >

              <label>
                LOẠI SÂN
              </label>


              <select

                value={
                  fieldType
                }

                onChange={
                  event =>
                    setFieldType(
                      event.target.value
                    )
                }

              >

                <option value="">
                  Tất cả loại sân
                </option>


                {
                  fieldTypes.map(
                    type => (

                      <option
                        key={
                          type
                        }
                        value={
                          type
                        }
                      >

                        {type}

                      </option>

                    )
                  )
                }

              </select>

            </div>


            <button

              type="button"

              className="
                field-filter__submit
              "

              onClick={
                handleSearch
              }

            >

              <Search
                size={18}
              />

              Tìm sân

            </button>

          </div>

        </section>


        {/* =================================================
            FIELD LIST
        ================================================= */}

        <section
          className="
            field-list-container
          "
        >


          <div
            className="
              field-list__heading
            "
          >

            <div>

              <h1>
                DANH SÁCH SÂN BÓNG
              </h1>


              <p>

                Lịch sân ngày{" "}

                <strong>
                  {selectedDate}
                </strong>

              </p>

            </div>


            <span
              className="
                field-list__result
              "
            >

              Tìm thấy{" "}

              {
                filteredFields.length
              }

              {" "}sân

            </span>

          </div>


          {/* LOADING */}

          {
            loading ? (

              <div
                className="
                  field-list__empty
                "
              >

                <div
                  className="
                    field-loading-spinner
                  "
                />

                <h2>
                  Đang kiểm tra lịch sân...
                </h2>

              </div>

            ) : error ? (

              /* ERROR */

              <div
                className="
                  field-list__empty
                "
              >

                <h2>
                  Không thể tải dữ liệu
                </h2>

                <p>
                  {error}
                </p>


                <button
                  type="button"
                  onClick={
                    handleSearch
                  }
                >
                  Thử lại
                </button>

              </div>

            ) : (
              filteredFields.length
              ===
              0
            ) ? (

              /* EMPTY */

              <div
                className="
                  field-list__empty
                "
              >

                <h2>
                  Không tìm thấy sân
                </h2>

                <p>
                  Hãy thử thay đổi bộ lọc.
                </p>

              </div>

            ) : (

              /* FIELD CARDS */

              <div
                className="
                  field-list__grid
                "
              >

                {
                  filteredFields.map(
                    field => (

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

                        selectedDate={
                          selectedDate
                        }

                        slots={
                          field.prices
                        }

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