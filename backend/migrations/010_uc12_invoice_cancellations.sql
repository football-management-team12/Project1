-- UC12 additive migration. Run on the target SQL Server before enabling UC12.
-- Existing Invoices, Payments and Bookings are deliberately unchanged.
IF OBJECT_ID(N'dbo.InvoiceAdminCancellations', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.InvoiceAdminCancellations (
        InvoiceID INT NOT NULL PRIMARY KEY REFERENCES dbo.Invoices(InvoiceID),
        CancelledBy INT NOT NULL REFERENCES dbo.Users(UserID),
        CancelledAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        Reason NVARCHAR(500) NOT NULL,
        CONSTRAINT CK_InvoiceCancellation_Reason CHECK (LEN(LTRIM(RTRIM(Reason))) > 0)
    );
END;
