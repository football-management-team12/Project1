import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CheckCircle2,
  QrCode,
  RefreshCw,
  XCircle,
} from "lucide-react";

import {
  createDeposit,
  getDepositInfo,
  updateDepositDemoStatus,
} from "../../services/booking_service";

import "./DepositPanel.css";


const PAYMENT_META = {

  NOT_CREATED:
    "Chưa tạo giao dịch",

  PENDING:
    "Chờ thanh toán",

  SUCCESS:
    "Đặt cọc thành công",

  FAILED:
    "Giao dịch thất bại",

  EXPIRED:
    "Đã hết hạn",

};


const formatMoney = (
  value
) => {

  return new Intl.NumberFormat(
    "vi-VN"
  ).format(
    Number(
      value || 0
    )
  );

};


const formatDateTime = (
  value
) => {

  if (!value) {

    return "--";

  }


  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return value;

  }


  return new Intl.DateTimeFormat(
    "vi-VN",
    {
      dateStyle:
        "short",

      timeStyle:
        "medium",
    }
  ).format(
    date
  );

};


const formatCountdown = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
};


function DepositPanel({
  bookingId,
  bookingStatus,
  onPaymentChanged,
}) {

  const [
    deposit,
    setDeposit,
  ] = useState(
    null
  );


  const [
    loading,
    setLoading,
  ] = useState(
    true
  );


  const [
    actionLoading,
    setActionLoading,
  ] = useState(
    false
  );


  const [
    error,
    setError,
  ] = useState(
    ""
  );


  const [
    message,
    setMessage,
  ] = useState(
    ""
  );

  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const onPaymentChangedRef = useRef(onPaymentChanged);
  onPaymentChangedRef.current = onPaymentChanged;


  // =========================================================
  // LOAD DEPOSIT
  // =========================================================

  const loadDeposit =
    useCallback(
      async () => {

        try {

          setLoading(
            true
          );

          setError(
            ""
          );


          const result =
            await getDepositInfo(
              bookingId
            );


          setDeposit(
            result
          );


        } catch (
          requestError
        ) {

          setDeposit(
            null
          );


          setError(
            requestError.message ||
            "Không thể tải thông tin đặt cọc."
          );


        } finally {

          setLoading(
            false
          );

        }

      },
      [
        bookingId,
      ]
    );


  // =========================================================
  // INITIAL LOAD
  // =========================================================

  useEffect(
    () => {

      let active =
        true;


      const load =
        async () => {

          try {

            const result =
              await getDepositInfo(
                bookingId
              );


            if (!active) {

              return;

            }


            setDeposit(
              result
            );


            setError(
              ""
            );


          } catch (
            requestError
          ) {

            if (!active) {

              return;

            }


            setError(
              requestError.message ||
              "Không thể tải thông tin đặt cọc."
            );


          } finally {

            if (active) {

              setLoading(
                false
              );

            }

          }

        };


      load();


      return () => {

        active =
          false;

      };

    },
    [
      bookingId,
    ]
  );


  useEffect(() => {
    const deadline = deposit?.deadline;
    if (!deadline || deposit?.isExpired) {
      setRemainingSeconds(null);
      return undefined;
    }

    let handledExpiry = false;
    const updateCountdown = () => {
      const seconds = Math.max(
        0,
        Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000)
      );
      setRemainingSeconds(seconds);

      if (seconds === 0 && !handledExpiry) {
        handledExpiry = true;
        loadDeposit();
        if (onPaymentChangedRef.current) onPaymentChangedRef.current();
      }
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(intervalId);
  }, [deposit?.deadline, deposit?.isExpired, loadDeposit]);


  // =========================================================
  // CREATE QR PAYMENT
  // =========================================================

  const handleCreate =
    async () => {

      try {

        setActionLoading(
          true
        );


        setError(
          ""
        );


        setMessage(
          ""
        );


        await createDeposit(
          bookingId
        );


        setMessage(
          "Đã tạo mã QR đặt cọc. Quét QR để chuyển khoản đúng số tiền hiển thị."
        );


        await loadDeposit();


      } catch (
        requestError
      ) {

        setError(
          requestError.message ||
          "Không thể tạo giao dịch đặt cọc."
        );


      } finally {

        setActionLoading(
          false
        );

      }

    };


  // =========================================================
  // DEMO PAYMENT STATUS
  // =========================================================

  const handleStatus =
    async (
      status
    ) => {

      const paymentId =
        deposit
          ?.payment
          ?.paymentId;


      if (!paymentId) {

        return;

      }


      try {

        setActionLoading(
          true
        );


        setError(
          ""
        );


        setMessage(
          ""
        );


        await updateDepositDemoStatus(
          paymentId,
          status
        );


        if (
          status
          ===
          "SUCCESS"
        ) {

          setMessage(
            "Đã mô phỏng thanh toán thành công. Booking được xác nhận."
          );

        } else if (
          status
          ===
          "FAILED"
        ) {

          setMessage(
            "Đã mô phỏng giao dịch thất bại. Có thể tạo lại giao dịch đặt cọc."
          );

        } else {

          setMessage(
            "Đã mô phỏng giao dịch hết hạn."
          );

        }


        await loadDeposit();


        if (
          onPaymentChanged
        ) {

          await onPaymentChanged();

        }


      } catch (
        requestError
      ) {

        setError(
          requestError.message ||
          "Không thể cập nhật trạng thái giao dịch."
        );


        await loadDeposit();


      } finally {

        setActionLoading(
          false
        );

      }

    };


  // =========================================================
  // LOADING
  // =========================================================

  if (loading) {

    return (

      <div className="deposit-panel">

        Đang tải thông tin đặt cọc...

      </div>

    );

  }


  const paymentStatus =
    String(
      deposit
        ?.currentPaymentStatus
        ||
        "NOT_CREATED"
    )
      .trim()
      .toUpperCase();


  const payment =
    deposit
      ?.payment;


  const vietQr =
    deposit
      ?.vietQr;


  const normalizedBookingStatus =
    String(
      bookingStatus
      ||
      ""
    )
      .trim()
      .toUpperCase();


  const canCreate =

    !deposit
      ?.isExpired

    &&

    [
      "NOT_CREATED",
      "FAILED",
      "EXPIRED",
    ].includes(
      paymentStatus
    )

    &&

    ![
      "CANCELLED",
      "COMPLETED",
    ].includes(
      normalizedBookingStatus
    );


  const canDemo =

    deposit
      ?.demoMode

    &&

    paymentStatus
      ===
      "PENDING"

    &&

    Boolean(
      payment
        ?.paymentId
    );


  return (

    <div className="deposit-panel">


      {/* =====================================================
          STATUS
      ====================================================== */}

      <div className="deposit-panel-head">

        <span>
          Trạng thái đặt cọc
        </span>


        <strong
          className={
            `deposit-status deposit-status-${paymentStatus.toLowerCase()}`
          }
        >

          {
            PAYMENT_META[
              paymentStatus
            ]
            ||
            paymentStatus
          }

        </strong>

      </div>


      {/* =====================================================
          DEPOSIT INFO
      ====================================================== */}

      {
        deposit && (

          <div className="deposit-summary">


            <p>

              <span>
                Tổng tiền sân
              </span>


              <strong>

                {
                  formatMoney(
                    deposit
                      .booking
                      ?.totalAmount
                  )
                }

                đ

              </strong>

            </p>


            <p>

              <span>
                Quy tắc đặt cọc
              </span>


              <strong>

                1/3 giá sân,
                làm tròn xuống 100.000đ

              </strong>

            </p>


            <p>

              <span>
                Tiền cần đặt cọc
              </span>


              <strong className="deposit-money">

                {
                  formatMoney(
                    deposit
                      .depositAmount
                  )
                }

                đ

              </strong>

            </p>


            <p>

              <span>
                Hạn đặt cọc
              </span>


              <strong>

                {
                  formatDateTime(
                    deposit
                      .deadline
                  )
                }

              </strong>

            </p>

            {
              remainingSeconds !== null &&
              remainingSeconds > 0 &&
              !deposit?.isExpired &&
              String(deposit?.booking?.status || "").toUpperCase() === "PENDING" &&
              paymentStatus !== "SUCCESS" && (
                <p className="deposit-countdown" aria-live="polite">
                  <span>Thời gian còn để đặt cọc</span>
                  <strong>{formatCountdown(remainingSeconds)}</strong>
                </p>
              )
            }

            {
              payment
                ?.reference
                && (

                <p>

                  <span>
                    Nội dung chuyển khoản
                  </span>


                  <strong>

                    {
                      payment
                        .reference
                    }

                  </strong>

                </p>

              )
            }


          </div>

        )
      }


      {/* =====================================================
          CREATE QR
      ====================================================== */}

      {
        canCreate && (

          <button
            type="button"

            className="deposit-primary"

            disabled={
              actionLoading
            }

            onClick={
              handleCreate
            }
          >

            <QrCode
              size={
                18
              }
            />


            {
              actionLoading

                ? "Đang tạo mã QR..."

                : "Tạo mã QR đặt cọc"
            }

          </button>

        )
      }


      {
        deposit?.isExpired &&
        paymentStatus !== "SUCCESS" && (
          <div className="deposit-error">
            Booking đã quá hạn đặt cọc nên không thể tạo mã QR. Hãy tạo booking mới để thanh toán.
          </div>
        )
      }


      {/* =====================================================
          QR
      ====================================================== */}

      {
        paymentStatus
          ===
          "PENDING"

        &&

        vietQr
          ?.imageUrl

        && (

          <div className="deposit-qr-box">

            <h3>

              Quét QR để đặt cọc

            </h3>


            <img
              src={
                vietQr
                  .imageUrl
              }

              alt={
                `VietQR đặt cọc booking ${bookingId}`
              }
            />


            <div className="deposit-bank-info">


              <p>

                <span>
                  Số tiền
                </span>


                <strong className="deposit-money">

                  {
                    formatMoney(
                      vietQr
                        .amount
                    )
                  }

                  đ

                </strong>

              </p>


              <p>

                <span>
                  Ngân hàng
                </span>


                <strong>

                  {
                    vietQr
                      .bankId
                    ||
                    "--"
                  }

                </strong>

              </p>


              <p>

                <span>
                  Số tài khoản
                </span>


                <strong>

                  {
                    vietQr
                      .accountNo
                    ||
                    "--"
                  }

                </strong>

              </p>


              <p>

                <span>
                  Chủ tài khoản
                </span>


                <strong>

                  {
                    vietQr
                      .accountName
                    ||
                    "--"
                  }

                </strong>

              </p>


              <p>

                <span>
                  Nội dung CK
                </span>


                <strong>

                  {
                    vietQr
                      .content
                    ||
                    "--"
                  }

                </strong>

              </p>


            </div>


            <small>

              QR đã chứa sẵn số tiền và
              nội dung chuyển khoản.
              Không tự sửa số tiền khi chuyển.

            </small>

          </div>

        )
      }


      {/* =====================================================
          QR CONFIG ERROR
      ====================================================== */}

      {
        paymentStatus
          ===
          "PENDING"

        &&

        !vietQr
          ?.imageUrl

        && (

          <div className="deposit-error">

            Chưa cấu hình tài khoản nhận tiền.
            Hãy điền VIETQR_BANK_ID,
            VIETQR_ACCOUNT_NO và
            VIETQR_ACCOUNT_NAME trong
            backend/.env rồi restart backend.

          </div>

        )
      }


      {/* =====================================================
          ERROR
      ====================================================== */}

      {
        error && (

          <div className="deposit-error">

            {error}

          </div>

        )
      }


      {/* =====================================================
          MESSAGE
      ====================================================== */}

      {
        message && (

          <div className="deposit-message">

            {message}

          </div>

        )
      }


      {/* =====================================================
          DEMO
      ====================================================== */}

      {
        canDemo && (

          <div className="deposit-demo">

            <small>

              Mô phỏng kết quả thanh toán
              cho Project 1

            </small>


            <div>


              <button
                type="button"

                className="deposit-demo-success"

                disabled={
                  actionLoading
                }

                onClick={() =>
                  handleStatus(
                    "SUCCESS"
                  )
                }
              >

                <CheckCircle2
                  size={
                    16
                  }
                />

                SUCCESS

              </button>


              <button
                type="button"

                className="deposit-demo-failed"

                disabled={
                  actionLoading
                }

                onClick={() =>
                  handleStatus(
                    "FAILED"
                  )
                }
              >

                <XCircle
                  size={
                    16
                  }
                />

                FAILED

              </button>


              <button
                type="button"

                className="deposit-demo-expired"

                disabled={
                  actionLoading
                }

                onClick={() =>
                  handleStatus(
                    "EXPIRED"
                  )
                }
              >

                EXPIRED

              </button>


            </div>

          </div>

        )
      }


      {/* =====================================================
          REFRESH
      ====================================================== */}

      <button
        type="button"

        className="deposit-refresh"

        disabled={
          loading
          ||
          actionLoading
        }

        onClick={
          loadDeposit
        }
      >

        <RefreshCw
          size={
            15
          }
        />

        Làm mới trạng thái

      </button>


    </div>

  );

}


export default DepositPanel;
