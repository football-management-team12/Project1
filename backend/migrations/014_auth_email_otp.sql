/* MANUAL ONLY. Backup and preflight instructions: docs/auth-gmail-otp.md.
   No connection or automatic execution is configured by this migration. */
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.Users', 'U') IS NULL
    THROW 51000, 'Users is required', 1;
IF COL_LENGTH('dbo.Users', 'Username') IS NULL
    THROW 51000, 'Apply migration 001 first', 1;
IF EXISTS (SELECT Username FROM dbo.Users GROUP BY Username HAVING COUNT(*) > 1)
    THROW 51000, 'Duplicate usernames: review manually before migration', 1;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.Users') AND name='UX_Users_Username')
    CREATE UNIQUE INDEX UX_Users_Username ON dbo.Users(Username);

-- Fail visibly rather than merging or deleting existing accounts.
IF EXISTS (SELECT LOWER(LTRIM(RTRIM(Email))) FROM dbo.Users WHERE Email IS NOT NULL
           GROUP BY LOWER(LTRIM(RTRIM(Email))) HAVING COUNT(*) > 1)
    THROW 51000, 'Duplicate normalized emails: review manually before migration', 1;
IF EXISTS (SELECT Phone FROM dbo.Users WHERE Phone IS NOT NULL GROUP BY Phone HAVING COUNT(*) > 1)
    THROW 51000, 'Duplicate phones: review manually before migration', 1;
IF COL_LENGTH('dbo.Users', 'OtpNormalizedEmail') IS NULL
    EXEC('ALTER TABLE dbo.Users ADD OtpNormalizedEmail AS LOWER(LTRIM(RTRIM(Email))) PERSISTED');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.Users') AND name='UX_Users_OtpEmail')
    EXEC('CREATE UNIQUE INDEX UX_Users_OtpEmail ON dbo.Users(OtpNormalizedEmail) WHERE Email IS NOT NULL');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.Users') AND name='UX_Users_OtpPhone')
    CREATE UNIQUE INDEX UX_Users_OtpPhone ON dbo.Users(Phone) WHERE Phone IS NOT NULL;

IF OBJECT_ID('dbo.PendingRegistrations', 'U') IS NULL
CREATE TABLE dbo.PendingRegistrations (
    PendingID uniqueidentifier NOT NULL PRIMARY KEY,
    FullName nvarchar(100) NOT NULL,
    Username varchar(30) NOT NULL,
    Email nvarchar(254) NOT NULL,
    Phone varchar(10) NOT NULL,
    PasswordHash varchar(60) NOT NULL,
    ExpiresAt datetime2 NOT NULL
);
IF OBJECT_ID('dbo.EmailOtpChallenges', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.EmailOtpChallenges (
        ChallengeID uniqueidentifier NOT NULL PRIMARY KEY,
        Email nvarchar(254) NOT NULL,
        Purpose varchar(20) NOT NULL CHECK (Purpose IN ('REGISTER','RESET_PASSWORD')),
        PendingID uniqueidentifier NULL REFERENCES dbo.PendingRegistrations(PendingID),
        UserID int NULL REFERENCES dbo.Users(UserID),
        OtpHash char(64) NOT NULL,
        ExpiresAt datetime2 NOT NULL,
        SentAt datetime2 NOT NULL,
        Attempts int NOT NULL DEFAULT 0 CHECK (Attempts BETWEEN 0 AND 5),
        Consumed bit NOT NULL DEFAULT 0
    );
    CREATE INDEX IX_EmailOtpChallenges_EmailPurpose ON dbo.EmailOtpChallenges(Email, Purpose);
END;
IF OBJECT_ID('dbo.PasswordResetGrants', 'U') IS NULL
CREATE TABLE dbo.PasswordResetGrants (
    GrantHash char(64) NOT NULL PRIMARY KEY,
    UserID int NOT NULL REFERENCES dbo.Users(UserID),
    ExpiresAt datetime2 NOT NULL,
    Consumed bit NOT NULL DEFAULT 0
);
IF OBJECT_ID('dbo.EmailOtpSendAttempts', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.EmailOtpSendAttempts (
        AttemptID bigint IDENTITY PRIMARY KEY,
        Email nvarchar(254) NOT NULL,
        IpHash char(64) NOT NULL,
        CreatedAt datetime2 NOT NULL
    );
    CREATE INDEX IX_EmailOtpSendAttempts_EmailTime ON dbo.EmailOtpSendAttempts(Email, CreatedAt);
    CREATE INDEX IX_EmailOtpSendAttempts_IpTime ON dbo.EmailOtpSendAttempts(IpHash, CreatedAt);
END;
COMMIT;
