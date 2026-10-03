import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Navbar from "../../components/Navbar/Navbar";

import FieldCard from "../../components/FieldCard/FieldCard";

import {
  getAllFieldsAvailability,
  getFields,
} from "../../services/field_service";

import "./FieldList.css";


const toArray = (payload) => {

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.Fields)) {
    return payload.Fields;
  }

  if (Array.isArray(payload?.fields)) {
    return payload.fields;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
};


const groupFieldRows = (payload) => {

  const rows = toArray(payload);

  const grouped = new Map();


  rows.forEach((row) => {

    const fieldID =
      row.FieldID ??
      row.fieldID ??
      row.id;


    if (
      fieldID === undefined ||
      fieldID === null
    ) {
      return;
    }


    if (!grouped.has(fieldID)) {

      grouped.set(
        fieldID,
        {
          FieldID:
            fieldID,

          FieldName:
            row.FieldName ??
            row.fieldName ??
            row.name ??
            `Sân ${fieldID}`,

          FieldType:
            row.FieldType ??
            row.fieldType ??
            row.type ??
            "",

          Location:
            row.Location ??
            row.location ??
            row.Address ??
            row.address ??
            "",

          Status:
            row.Status ??
            row.status ??
            "AVAILABLE",

          Prices: [],
        }
      );
    }


    const field =
      grouped.get(fieldID);


    const hasPriceData =
      row.PriceID !== undefined ||
      row.Price !== undefined ||
      row.StartTime !== undefined ||
      row.EndTime !== undefined;


    if (hasPriceData) {

      const priceID =
        row.PriceID ??
        `${row.StartTime}-${row.EndTime}`;


      const duplicated =
        field.Prices.some(
          (item) =>
            (
              item.PriceID ??
              `${item.StartTime}-${item.EndTime}`
            )
            === priceID
        );


      if (!duplicated) {

        field.Prices.push({

          PriceID:
            row.PriceID,

          StartTime:
            row.StartTime,

          EndTime:
            row.EndTime,

          Price:
            Number(
              row.Price ?? 0
            ),
        });
      }
    }
  });


  return Array.from(
    grouped.values()
  );
};


const localDateString = () => {

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


  return (
    `${year}-${month}-${day}`
  );
};


const FieldList = () => {

  // =========================================================
  // FIELD LIST
  // =========================================================

  const [
    fields,
    setFields,
  ] = useState([]);


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    error,
    setError,
  ] = useState("");


  // =========================================================
  // SEARCH / FILTER
  // =========================================================

  const [
    search,
    setSearch,
  ] = useState("");


  const [
    locationFilter,
    setLocationFilter,
  ] = useState("");


  const [
    typeFilter,
    setTypeFilter,
  ] = useState("");


  // =========================================================
  // AVAILABILITY
  // =========================================================

  const [
    selectedDate,
    setSelectedDate,
  ] = useState("");


  const [
    availability,
    setAvailability,
  ] = useState(null);


  const [
    availabilityLoading,
    setAvailabilityLoading,
  ] = useState(false);


  const [
    availabilityError,
    setAvailabilityError,
  ] = useState("");


  // =========================================================
  // LOAD FIELD LIST
  // =========================================================

  useEffect(() => {

    let cancelled = false;


    const loadFields = async () => {

      setLoading(true);

      setError("");


      try {

        const data =
          await getFields();


        if (!cancelled) {

          setFields(
            groupFieldRows(data)
          );
        }

      } catch (err) {

        if (!cancelled) {

          setError(
            err.message ||
            "Không thể tải danh sách sân."
          );

          setFields([]);
        }

      } finally {

        if (!cancelled) {
          setLoading(false);
        }
      }
    };


    loadFields();


    return () => {

      cancelled = true;
    };

  }, []);


  // =========================================================
  // LOAD AVAILABILITY WHEN DATE CHANGES
  // =========================================================

  useEffect(() => {

    let cancelled = false;


    if (!selectedDate) {

      setAvailability(null);

      setAvailabilityError("");

      setAvailabilityLoading(false);

      return undefined;
    }


    const loadAvailability = async () => {

      setAvailabilityLoading(true);

      setAvailabilityError("");


      try {

        const data =
          await getAllFieldsAvailability(
            selectedDate
          );


        if (!cancelled) {

          setAvailability(data);
        }

      } catch (err) {

        if (!cancelled) {

          setAvailability(null);

          setAvailabilityError(
            err.message ||
            "Không thể kiểm tra lịch trống của sân."
          );
        }

      } finally {

        if (!cancelled) {

          setAvailabilityLoading(false);
        }
      }
    };


    loadAvailability();


    return () => {

      cancelled = true;
    };

  }, [selectedDate]);


  // =========================================================
  // FILTER OPTIONS
  // =========================================================

  const locations =
    useMemo(
      () => {

        return [
          ...new Set(
            fields
              .map(
                (item) =>
                  item.Location
              )
              .filter(Boolean)
          ),
        ].sort();

      },
      [fields]
    );


  const fieldTypes =
    useMemo(
      () => {

        return [
          ...new Set(
            fields
              .map(
                (item) =>
                  item.FieldType
              )
              .filter(Boolean)
          ),
        ].sort();

      },
      [fields]
    );


  // =========================================================
  // AVAILABILITY MAP
  // =========================================================

  const availabilityMap =
    useMemo(
      () => {

        const map =
          new Map();


        const items =
          toArray(
            availability
          );


        items.forEach(
          (item) => {

            const fieldID =
              item.FieldID ??
              item.fieldID ??
              item.id;


            if (
              fieldID !== undefined &&
              fieldID !== null
            ) {

              map.set(
                String(fieldID),
                item
              );
            }
          }
        );


        return map;

      },
      [availability]
    );


  // =========================================================
  // FILTER FIELD LIST
  // =========================================================

  const filteredFields =
    useMemo(
      () => {

        const keyword =
          search
            .trim()
            .toLowerCase();


        return fields.filter(
          (field) => {

            const name =
              String(
                field.FieldName || ""
              ).toLowerCase();


            const location =
              String(
                field.Location || ""
              );


            const type =
              String(
                field.FieldType || ""
              );


            const matchSearch =
              !keyword ||
              name.includes(
                keyword
              );


            const matchLocation =
              !locationFilter ||
              location ===
                locationFilter;


            const matchType =
              !typeFilter ||
              type ===
                typeFilter;


            return (
              matchSearch &&
              matchLocation &&
              matchType
            );
          }
        );

      },
      [
        fields,
        search,
        locationFilter,
        typeFilter,
      ]
    );


  // =========================================================
  // CLEAR FILTER
  // =========================================================

  const clearFilters = () => {

    setSearch("");

    setLocationFilter("");

    setTypeFilter("");
  };


  return (

    <>
      <Navbar />


      <main className="field-list-page">

        {/* ===================================================
            TITLE
        =================================================== */}

        <section className="field-list-heading">

          <div>

            <p className="field-list-eyebrow">
              ĐẶT SÂN BÓNG
            </p>


            <h1>
              Danh sách sân
            </h1>


            <p>
              Tìm sân phù hợp, chọn ngày và kiểm tra
              khung giờ còn trống trước khi đặt.
            </p>

          </div>

        </section>


        {/* ===================================================
            FILTER
        =================================================== */}

        <section className="field-filter-panel">

          <div
            className="
              field-filter-control
              field-filter-search
            "
          >

            <label htmlFor="field-search">
              Tìm theo tên sân
            </label>


            <input
              id="field-search"
              type="search"

              value={
                search
              }

              onChange={
                (event) =>
                  setSearch(
                    event.target.value
                  )
              }

              placeholder="Nhập tên sân..."
            />

          </div>


          <div className="field-filter-control">

            <label htmlFor="field-location">
              Khu vực
            </label>


            <select
              id="field-location"

              value={
                locationFilter
              }

              onChange={
                (event) =>
                  setLocationFilter(
                    event.target.value
                  )
              }
            >

              <option value="">
                Tất cả khu vực
              </option>


              {
                locations.map(
                  (location) => (

                    <option
                      key={
                        location
                      }

                      value={
                        location
                      }
                    >
                      {location}
                    </option>
                  )
                )
              }

            </select>

          </div>


          <div className="field-filter-control">

            <label htmlFor="field-type">
              Loại sân
            </label>


            <select
              id="field-type"

              value={
                typeFilter
              }

              onChange={
                (event) =>
                  setTypeFilter(
                    event.target.value
                  )
              }
            >

              <option value="">
                Tất cả loại sân
              </option>


              {
                fieldTypes.map(
                  (type) => (

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


          <div className="field-filter-control">

            <label htmlFor="booking-date">
              Ngày kiểm tra
            </label>


            <input
              id="booking-date"
              type="date"

              min={
                localDateString()
              }

              value={
                selectedDate
              }

              onChange={
                (event) =>
                  setSelectedDate(
                    event.target.value
                  )
              }
            />

          </div>


          <button
            type="button"

            className="
              field-filter-reset
            "

            onClick={
              clearFilters
            }
          >
            Xóa bộ lọc
          </button>

        </section>


        {/* ===================================================
            AVAILABILITY SUMMARY
        =================================================== */}

        {
          selectedDate && (

            <section
              className="
                availability-summary
              "

              aria-live="polite"
            >

              {
                availabilityLoading && (

                  <p>
                    Đang kiểm tra lịch sân...
                  </p>
                )
              }


              {
                !availabilityLoading &&
                availabilityError && (

                  <p
                    className="
                      availability-summary-error
                    "
                  >
                    {availabilityError}
                  </p>
                )
              }


              {
                !availabilityLoading &&
                !availabilityError &&
                availability && (

                  <p>

                    Ngày{" "}

                    <strong>
                      {
                        availability.Date ||
                        selectedDate
                      }
                    </strong>

                    :{" "}

                    <strong>
                      {
                        availability
                          .AvailableFields ??
                        0
                      }
                    </strong>

                    {" "}
                    sân còn ít nhất một
                    khung giờ trống /{" "}

                    {
                      availability
                        .TotalFields ??
                      fields.length
                    }

                    {" "}
                    sân.

                  </p>
                )
              }

            </section>
          )
        }


        {/* ===================================================
            LOADING
        =================================================== */}

        {
          loading && (

            <div className="field-list-state">

              Đang tải danh sách sân...

            </div>
          )
        }


        {/* ===================================================
            ERROR
        =================================================== */}

        {
          !loading &&
            error && (

              <div
                className="
                  field-list-state
                  field-list-state-error
                "
              >
                {error}
              </div>
            )
        }


        {/* ===================================================
            EMPTY
        =================================================== */}

        {
          !loading &&
            !error &&
            filteredFields.length === 0 && (

              <div className="field-list-state">

                Không có sân phù hợp với
                điều kiện tìm kiếm.

              </div>
            )
        }


        {/* ===================================================
            FIELD LIST
        =================================================== */}

        {
          !loading &&
            !error &&
            filteredFields.length > 0 && (

              <section className="field-card-grid">

                {
                  filteredFields.map(
                    (field) => {

                      const fieldAvailability =
                        availabilityMap.get(
                          String(
                            field.FieldID
                          )
                        );


                      return (

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
                            fieldAvailability
                              ?.FieldStatus ??
                            field.Status
                          }

                          slots={
                            selectedDate

                              ? (
                                  fieldAvailability
                                    ?.Slots ||
                                  []
                                )

                              : (
                                  field.Prices ||
                                  []
                                )
                          }

                          selectedDate={
                            selectedDate
                          }

                          availabilityLoaded={
                            Boolean(
                              selectedDate
                            ) &&

                            !availabilityLoading &&

                            !availabilityError &&

                            Boolean(
                              fieldAvailability
                            )
                          }

                          availabilityLoading={
                            Boolean(
                              selectedDate
                            ) &&
                            availabilityLoading
                          }

                          availabilityError={
                            selectedDate

                              ? availabilityError

                              : ""
                          }

                          hasAvailableSlot={
                            fieldAvailability
                              ?.HasAvailableSlot ??
                            false
                          }

                        />
                      );
                    }
                  )
                }

              </section>
            )
        }

      </main>
    </>
  );
};


export default FieldList;