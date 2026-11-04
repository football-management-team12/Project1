/* Run against FootballBookingDB to add booking deposits to the existing Payments table. */
USE [FootballBookingDB];
GO

IF OBJECT_ID(N'dbo.Payments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Payments
    (
        PaymentID INT IDENTITY(1, 1) NOT NULL
            CONSTRAINT PK_Payments PRIMARY KEY,
        InvoiceID INT NULL,
        BookingID INT NULL,
        PaymentType NVARCHAR(20) NULL,
        Amount DECIMAL(12, 2) NULL,
        Method VARCHAR(50) NULL,
        PaymentMethod NVARCHAR(30) NULL,
        TransactionCode VARCHAR(100) NULL,
        Reference NVARCHAR(100) NULL,
        Deadline DATETIME2(0) NULL,
        PaymentDate DATETIME NULL,
        Status VARCHAR(30) NULL,
        CreatedAt DATETIME2(0) NULL,
        UpdatedAt DATETIME2(0) NULL
    );
END;
GO

/* Keep the legacy invoice-payment columns and add the booking-payment fields. */
IF COL_LENGTH(N'dbo.Payments', N'BookingID') IS NULL
    ALTER TABLE dbo.Payments ADD BookingID INT NULL;
IF COL_LENGTH(N'dbo.Payments', N'PaymentType') IS NULL
    ALTER TABLE dbo.Payments ADD PaymentType NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.Payments', N'PaymentMethod') IS NULL
    ALTER TABLE dbo.Payments ADD PaymentMethod NVARCHAR(30) NULL;
IF COL_LENGTH(N'dbo.Payments', N'Reference') IS NULL
    ALTER TABLE dbo.Payments ADD Reference NVARCHAR(100) NULL;
IF COL_LENGTH(N'dbo.Payments', N'Deadline') IS NULL
    ALTER TABLE dbo.Payments ADD Deadline DATETIME2(0) NULL;
IF COL_LENGTH(N'dbo.Payments', N'CreatedAt') IS NULL
    ALTER TABLE dbo.Payments ADD CreatedAt DATETIME2(0) NULL;
IF COL_LENGTH(N'dbo.Payments', N'UpdatedAt') IS NULL
    ALTER TABLE dbo.Payments ADD UpdatedAt DATETIME2(0) NULL;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.Payments')
      AND name = N'IX_Payments_BookingTypeLatest'
)
    CREATE INDEX IX_Payments_BookingTypeLatest
        ON dbo.Payments (BookingID, PaymentType, PaymentID DESC);
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.Payments')
      AND name = N'IX_Payments_Reference'
)
    CREATE INDEX IX_Payments_Reference
        ON dbo.Payments (Reference);
GO
