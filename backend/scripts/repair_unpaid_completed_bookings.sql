-- Run in SSMS on the SAME database used by the affected backend.
-- Preview by default. Check the candidate row before setting @Apply = 1.
-- No schema changes. Never changes successful receipts or paid/refunded records.
SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @BookingID INT = NULL; -- REQUIRED: enter one booking ID after checking the affected database.
DECLARE @Apply BIT = 0;
DECLARE @DepositDeadlineMinutes INT = 10; -- Match backend DEPOSIT_DEADLINE_MINUTES.
IF @BookingID IS NULL OR @DepositDeadlineMinutes < 1
    THROW 50001, 'A BookingID and valid deposit deadline are required.', 1;

BEGIN TRY
    SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    BEGIN TRANSACTION;
    SELECT B.BookingID, B.Status AS OldStatus, B.TotalAmount, B.CreatedAt
    INTO #UnpaidBookingRepair
    FROM dbo.Bookings B WITH (UPDLOCK,HOLDLOCK)
    WHERE B.BookingID=@BookingID AND B.Status IN ('CONFIRMED','COMPLETED')
      AND B.TotalAmount>0
      AND (EXISTS (SELECT 1 FROM dbo.Payments P WHERE P.BookingID=B.BookingID
                   AND P.PaymentType='DEPOSIT' AND P.Deadline<=GETDATE())
           OR DATEADD(MINUTE,@DepositDeadlineMinutes,B.CreatedAt)<=GETDATE())
      AND NOT EXISTS (SELECT 1 FROM dbo.Payments P WHERE P.BookingID=B.BookingID AND P.Status='SUCCESS')
      AND NOT EXISTS (SELECT 1 FROM dbo.Payments P WHERE P.BookingID=B.BookingID
                      AND P.PaymentType='DEPOSIT' AND P.Status='PENDING' AND P.Deadline>GETDATE())
      AND NOT EXISTS (SELECT 1 FROM dbo.Invoices I WHERE I.BookingID=B.BookingID
                      AND (I.PaidAmount>0 OR I.PaymentStatus='PAID'))
      AND NOT EXISTS (SELECT 1 FROM dbo.BookingDepositRefunds R WHERE R.BookingID=B.BookingID)
      AND NOT EXISTS (SELECT 1 FROM dbo.BookingCancellationRequests R
                      WHERE R.BookingID=B.BookingID AND R.Status='PENDING_REVIEW');

    SELECT DB_NAME() AS TargetDatabase, @Apply AS ApplyChanges, * FROM #UnpaidBookingRepair;
    IF @Apply=0
    BEGIN
        ROLLBACK TRANSACTION;
        PRINT 'PREVIEW ONLY: no application data changed. Review candidates before Apply=1.';
    END
    ELSE
    BEGIN
        UPDATE B SET Status='CANCELLED'
        OUTPUT deleted.BookingID,deleted.Status AS OldStatus,inserted.Status AS NewStatus
        FROM dbo.Bookings B JOIN #UnpaidBookingRepair C ON C.BookingID=B.BookingID;
        UPDATE P SET Status='EXPIRED',UpdatedAt=GETDATE()
        FROM dbo.Payments P JOIN #UnpaidBookingRepair C ON C.BookingID=P.BookingID
        WHERE P.PaymentType='DEPOSIT' AND P.Status='PENDING';
        COMMIT TRANSACTION;
    END;
    IF OBJECT_ID('tempdb..#UnpaidBookingRepair') IS NOT NULL DROP TABLE #UnpaidBookingRepair;
    SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
    IF OBJECT_ID('tempdb..#UnpaidBookingRepair') IS NOT NULL DROP TABLE #UnpaidBookingRepair;
    SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
    THROW;
END CATCH;
