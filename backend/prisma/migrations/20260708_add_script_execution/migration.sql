-- Create ScriptExecution model
CREATE TABLE "ScriptExecution" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "scriptName" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScriptExecution_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX "ScriptExecution_scriptId_idx" ON "ScriptExecution"("scriptId");
CREATE INDEX "ScriptExecution_deviceId_idx" ON "ScriptExecution"("deviceId");
CREATE INDEX "ScriptExecution_tenantId_idx" ON "ScriptExecution"("tenantId");
CREATE INDEX "ScriptExecution_createdAt_idx" ON "ScriptExecution"("createdAt");

-- Add foreign keys
ALTER TABLE "ScriptExecution" ADD CONSTRAINT "ScriptExecution_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScriptExecution" ADD CONSTRAINT "ScriptExecution_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScriptExecution" ADD CONSTRAINT "ScriptExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
