#!/bin/sh
# Monitor de Faults TR-069 no backend
# Uso: ./monitor-faults.sh [--watch]
#   --watch: modo contínuo (fica observando os logs)
#   sem args: mostra faults das últimas 24h

BACKEND="tr069-backend"
DB="tr069-postgres"
WATCH=0

if [ "$1" = "--watch" ]; then
  WATCH=1
fi

query_faults() {
  docker logs "$BACKEND" --tail 10000 2>&1 | grep -E "(Fault 9005|Fault 9814|FAULT-DETAIL|RAPID-RECONNECT|IN_PROGRESS.*stale|marked as unsupported)" | tail -30
}

query_unsupported_gaps() {
  docker exec "$DB" psql -U acs -d tr069_acs -c "
    SELECT d.serial, d.model_name, dm.name, 
           (SELECT COUNT(*) FROM public.\"Task\" t 
            WHERE t.device_id = d.id 
            AND t.type = 'SetParameterValues' 
            AND t.error LIKE '%9005%'
            AND t.created_at > NOW() - INTERVAL '24 hours') as faults_24h
    FROM public.\"Device\" d
    JOIN public.\"DeviceModel\" dm ON dm.id = d.model_id
    WHERE d.model_id IS NOT NULL
    ORDER BY faults_24h DESC
    LIMIT 10;
  " 2>/dev/null
}

echo "=== Faults recentes ==="
query_faults

echo ""
echo "=== Dispositivos com mais Fault 9005 (24h) ==="
query_unsupported_gaps

echo ""
echo "=== Paths unsupported por modelo ==="
docker exec "$DB" psql -U acs -d tr069_acs -c "
  SELECT name, jsonb_array_length(\"unsupportedParameters\") as count, 
         \"unsupportedParameters\" 
  FROM public.\"DeviceModel\" 
  WHERE \"unsupportedParameters\" IS NOT NULL 
  AND jsonb_array_length(\"unsupportedParameters\") > 0
  ORDER BY count DESC;
" 2>/dev/null

if [ "$WATCH" = "1" ]; then
  echo ""
  echo "=== Monitorando em tempo real (Ctrl+C para sair) ==="
  docker logs "$BACKEND" -f 2>&1 | grep --line-buffered -E "(Fault|FAULT|9005|9814|stale|unsupported|SPV|createSetParamTask)"
fi
