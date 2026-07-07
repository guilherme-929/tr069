DELETE FROM "Task" WHERE "deviceId" = (SELECT id FROM "Device" WHERE serial = 'ZTE0QJNQ1407460');
SELECT COUNT(*) as remaining FROM "Task" WHERE "deviceId" = (SELECT id FROM "Device" WHERE serial = 'ZTE0QJNQ1407460');
