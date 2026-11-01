-- UC07 base audit; preserve all existing cancellation history.
IF OBJECT_ID('dbo.BookingCancellations', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BookingCancellations (
        CancellationID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BookingID INT NOT NULL UNIQUE REFERENCES dbo.Bookings(BookingID),
        CanceledByUserID INT NOT NULL REFERENCES dbo.Users(UserID),
        CanceledByRole VARCHAR(20) NOT NULL,
        Reason NVARCHAR(500) NULL,
        DepositPaid DECIMAL(18,2) NOT NULL DEFAULT 0,
        RefundStatus VARCHAR(30) NOT NULL,
        CanceledAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        CHECK (RefundStatus IN ('MANUAL_REVIEW','NOT_REQUIRED'))
    );
END;
