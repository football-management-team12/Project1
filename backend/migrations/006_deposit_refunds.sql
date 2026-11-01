-- SQL Server: run before starting the updated backend.
IF OBJECT_ID('dbo.BookingDepositRefunds', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BookingDepositRefunds (
        BookingID INT NOT NULL PRIMARY KEY REFERENCES dbo.Bookings(BookingID),
        Amount DECIMAL(18,2) NOT NULL CHECK (Amount > 0),
        ConfirmedByUserID INT NOT NULL REFERENCES dbo.Users(UserID),
        ConfirmedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
    );
END;
