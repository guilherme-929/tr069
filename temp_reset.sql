UPDATE "Task" SET status = 'PENDING' WHERE status = 'IN_PROGRESS' AND "deviceId" = (SELECT id FROM "Device" WHERE serial = 'ZTE0QJNQ1407460');
SELECT COUNT(*) as total_tasks FROM "Task" WHERE "deviceId" = (SELECT id FROM "Device" WHERE serial = 'ZTE0QJNQ1407460');
SELECT status, COUNT(*) FROM "Task" WHERE "deviceId" = (SELECT id FROM "Device" WHERE serial = 'ZTE0QJNQ1407460') GROUP BY status;
