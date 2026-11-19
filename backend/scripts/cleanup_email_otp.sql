/* Optional manual/scheduled cleanup; never run at application startup.
   Retain a day for troubleshooting; send-attempt retention exceeds the rate window. */
SET XACT_ABORT ON;
BEGIN TRANSACTION;
DELETE TOP (5000) FROM dbo.EmailOtpChallenges WHERE ExpiresAt < DATEADD(day,-1,SYSUTCDATETIME());
DELETE TOP (5000) FROM dbo.PasswordResetGrants WHERE ExpiresAt < DATEADD(day,-1,SYSUTCDATETIME());
DELETE TOP (5000) FROM dbo.PendingRegistrations
WHERE ExpiresAt < DATEADD(day,-1,SYSUTCDATETIME())
AND NOT EXISTS (SELECT 1 FROM dbo.EmailOtpChallenges c WHERE c.PendingID=PendingRegistrations.PendingID);
DELETE TOP (5000) FROM dbo.EmailOtpSendAttempts WHERE CreatedAt < DATEADD(day,-1,SYSUTCDATETIME());
COMMIT;
