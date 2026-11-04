-- UC07 approval workflow. Run before 006/007/008.
IF OBJECT_ID('dbo.BookingCancellationRequests', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BookingCancellationRequests (
        RequestID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BookingID INT NOT NULL REFERENCES dbo.Bookings(BookingID),
        RequestedByUserID INT NOT NULL REFERENCES dbo.Users(UserID),
        Reason NVARCHAR(500) NULL,
        Status VARCHAR(20) NOT NULL DEFAULT 'PENDING_REVIEW',
        RequestedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        ReviewedByUserID INT NULL REFERENCES dbo.Users(UserID),
        ReviewedAt DATETIME2(0) NULL,
        ReviewNote NVARCHAR(500) NULL,
        CHECK (Status IN ('PENDING_REVIEW','APPROVED','REJECTED'))
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.BookingCancellationRequests') AND name='UX_UC07_PendingRequest')
    CREATE UNIQUE INDEX UX_UC07_PendingRequest ON dbo.BookingCancellationRequests(BookingID) WHERE Status='PENDING_REVIEW';
