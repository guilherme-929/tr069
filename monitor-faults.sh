#!/bin/sh
# Monitor de Faults TR-069 no backend
# Uso: ./monitor-faults.sh [--watch] [--webhook URL]
#   --watch: modo contínuo (fica observando os logs)
#   --webhook URL: envia alertas via webhook (Slack/Discord/Telegram compatível)
#   sem args: mostra faults das últimas 24h

BACKEND="tr069-backend"
DB="tr069-postgres"
WATCH=0
WEBHOOK_URL=""

while [ $# -gt 0 ]; do
  case "$1" in
    --watch) WATCH=1; shift ;;
    --webhook) WEBHOOK_URL="$2"; shift 2 ;;
    *) echo "Uso: $0 [--watch] [--webhook URL]"; exit 1 ;;
  esac
done

# Arquivo de estado para evitar alertas repetidos do mesmo path
STATE_FILE="/tmp/monitor-faults-state.txt"

send_webhook() {
  local title="$1"
  local message="$2"
  local color="$3"
  if [ -z "$WEBHOOK_URL" ]; then return; fi
  
  # Formato compatível com Slack/Discord/Telegram (via Bot API)
  local payload
  if echo "$WEBHOOK_URL" | grep -qi "discord"; then
    payload=$(cat <<JSON
{
  "embeds": [{
    "title": "$title",
    "description": "$message",
    "color": ${color:-16711680},
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }]
}
JSON
)
  elif echo "$WEBHOOK_URL" | grep -qi "api.telegram"; then
    payload="{\"text\": \"*$title*\n$message\", \"parse_mode\": \"Markdown\"}"
  else
    # Slack-compatível (fallback)
    payload="{\"text\": \"[$title] $message\"}"
  fi
  
  curl -s -H "Content-Type: application/json" -X POST -d "$payload" "$WEBHOOK_URL" >/dev/null 2>&1
}

alert_new_unsupported() {
  local path="$1"
  local model="$2"
  local serial="$3"
  if [ -z "$path" ] || [ -z "$model" ]; then return; fi
  
  local key="${model}:${path}"
  if [ -f "$STATE_FILE" ] && grep -Fxq "$key" "$STATE_FILE" 2>/dev/null; then
    return # já alertamos este path para este modelo
  fi
  echo "$key" >> "$STATE_FILE"
  
  echo "$(date '+%Y-%m-%d %H:%M:%S') [ALERT] Novo unsupported path: $path (modelo: $model, device: $serial)"
  send_webhook \
    "⚠️ Novo unsupported path TR-069" \
    "Path: \`$path\`\nModelo: $model\nDevice: $serial\n\nJá foi marcado como unsupported permanentemente." \
    16753920
}

query_faults() {
  docker logs "$BACKEND" --tail 10000 2>&1 | grep -E "(Fault 9005|Fault 9814|FAULT-DETAIL|RAPID-RECONNECT|IN_PROGRESS.*stale|marked as unsupported|vendor)" | tail -30
}

query_new_unsupported() {
  docker exec "$DB" psql -U acs -d tr069_acs -t -A -F',' 2>/dev/null <<SQL
    SELECT dm.name, d.serial, up.path
    FROM public."DeviceModel" dm
    CROSS JOIN LATERAL jsonb_array_elements_text(dm."unsupportedParameters") AS up(path)
    LEFT JOIN public."Device" d ON d.model_id = dm.id
    WHERE dm."updatedAt" > NOW() - INTERVAL '24 hours'
    AND dm."unsupportedParameters" IS NOT NULL
    AND jsonb_array_length(dm."unsupportedParameters") > 0
    ORDER BY dm."updatedAt" DESC
    LIMIT 20;
SQL
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

# Alertar sobre novos unsupported paths desde a última execução
if [ -n "$WEBHOOK_URL" ]; then
  echo ""
  echo "=== Novos unsupported paths (24h) ==="
  while IFS=',' read -r model serial path; do
    [ -z "$path" ] && continue
    alert_new_unsupported "$path" "$model" "$serial"
  done <<EOF
$(query_new_unsupported)
EOF
fi

# Alertar se houver tasks IN_PROGRESS presas (possível regressão)
STUCK_COUNT=$(docker exec "$DB" psql -U acs -d tr069_acs -t -A 2>/dev/null -c "
  SELECT COUNT(*) FROM public.\"Task\" 
  WHERE status = 'IN_PROGRESS' 
  AND \"updatedAt\" < NOW() - INTERVAL '30 minutes';
")
if [ "$STUCK_COUNT" -gt 0 ] 2>/dev/null; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') [WARN] $STUCK_COUNT tasks IN_PROGRESS presas (possível regressão)"
  send_webhook \
    "⚠️ $STUCK_COUNT tasks IN_PROGRESS presas" \
    "$STUCK_COUNT tasks estão IN_PROGRESS há mais de 30 min. Possível regressão no fix Fault 9005." \
    16753920
fi

if [ "$WATCH" = "1" ]; then
  echo ""
  echo "=== Monitorando em tempo real (Ctrl+C para sair) ==="
  docker logs "$BACKEND" -f 2>&1 | grep --line-buffered -E "(Fault|FAULT|9005|9814|stale|unsupported|SPV|createSetParamTask|vendor|marked as unsupported)"
fi
