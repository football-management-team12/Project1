/* Run once against FootballBookingDB before deploying the registration API.
   Existing accounts receive a deterministic username based on UserID. */
IF COL_LENGTH('dbo.Users', 'Username') IS NULL
BEGIN
    ALTER TABLE dbo.Users ADD Username VARCHAR(30) NULL;
END;
GO

UPDATE dbo.Users
SET Username = CONCAT('user', UserID)
WHERE Username IS NULL OR LTRIM(RTRIM(Username)) = '';
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'UX_Users_Username'
)
BEGIN
    CREATE UNIQUE INDEX UX_Users_Username ON dbo.Users(Username);
END;
GO
