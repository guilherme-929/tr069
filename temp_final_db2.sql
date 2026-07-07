SELECT type, status, attempts, "maxAttempts", "createdAt", "updatedAt"
FROM "Task"
WHERE "deviceId" = (SELECT id FROM "Device" WHERE serial = 'ZTE0QJNQ1407460')
ORDER BY "updatedAt" DESC
LIMIT 20;
