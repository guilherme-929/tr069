# Plano de Implementação — Correção CPEs TP-Link & ZTE

## Status Atual (13/07/2026)

### Dispositivos em produção
| Serial | Fabricante | Modelo | Status | Problema |
|--------|-----------|--------|--------|----------|
| ZTE0QJNQ1407460 | ZTE | F670L | ONLINE (conecta a cada ~20s) | WiFi/clientes não aparecem; loop de conexão |
| 22521Y0001317 | TP-Link | XX530v | ONLINE | Fault 9814 ao ler parâmetros |
| V25A024003204 | TP-Link | XC220-G3 | OFFLINE | Desconectado desde 12/07 |

---

## Problema 1: TP-Link XX530v — Fault 9814 em GetParameterValues

### Diagnóstico
- Descoberta (GetParameterNames) funciona ✅ — encontra 680+ parâmetros WiFi
- Leitura (GetParameterValues) falha ❌ → Fault 9814 "Parse xml string failed"
- CPE usa TR-181 (`Device.WiFi.*`) com 16 SSIDs + 16 AccessPoints
- System tenta ler parâmetros em lote grande, XML gerado pode ter problemas

### Causas possíveis
1. Tamanho excessivo do XML de GetParameterValues (centenas de param names)
2. Parâmetros que o CPE não suporta sendo incluídos
3. Namespace incorreto em elementos filhos
4. ConnectionRequestURL apontando para o ACS (`179.51.184.17:7547`) em vez do CPE
5. ManagementServer.URL configurado como `http://acs.local:7547/cwmp` (hostname inválido)

### Ações Corretivas

#### 1.1 Corrigir GetParameterValues para TP-Link (URGENTE)
**Arquivo:** `backend/src/acs/cwmp.service.ts`

- [ ] Adicionar lógica para detectar CPEs TP-Link e usar namespace `Device.WiFi.` corretamente
- [ ] Limitar número de parâmetros por requisição GetParameterValues (max 10-15 por vez)
- [ ] Separar requisições por tipo (essenciais, vendor, hosts) — já existe lógica parcial
- [ ] Usar `Device.WiFi.AccessPoint.{i}.Security.KeyPassphrase` para senha (não `Device.WiFi.SSID.{i}.KeyPassphrase`)
- [ ] Usar `Device.WiFi.AccessPoint.{i}.AssociatedDevice.{n}.*` para clientes (não WLANConfiguration)

**Trecho de código a modificar** (~linha 1138-1144):
```typescript
// ATUAL (para TR-181):
if (useTR181) {
  essentialPathsByInstance[i].push(
    `Device.WiFi.SSID.${i}.SSID`,
    `Device.WiFi.SSID.${i}.Enable`,
    `Device.WiFi.AccessPoint.${i}.Security.KeyPassphrase`,
  );
}

// CORREÇÃO - limitar instâncias e adicionar fallback TP-Link:
if (useTR181) {
  if (i <= 4) { // Limitar a 4 instâncias principais
    essentialPathsByInstance[i].push(
      `Device.WiFi.SSID.${i}.SSID`,
      `Device.WiFi.SSID.${i}.Enable`,
      `Device.WiFi.AccessPoint.${i}.Security.KeyPassphrase`,
    );
  }
}
```

#### 1.2 Corrigir ConnectionRequestURL do TP-Link
- [ ] Verificar se `179.51.184.17` é o IP real do CPE ou se é o IP do ACS
- [ ] Se for o CPE, ConnectionRequestURL deve usar a porta do CPE (não 7547)
- [ ] Corrigir lógica de detecção de IP no `handleInform` (linha 208-253)
- [ ] Enviar SetParameterValues para corrigir `ManagementServer.URL` para URL pública correta

#### 1.3 Aplicar correção via API
```bash
# Corrigir ACS URL do TP-Link
curl -X PUT http://179.51.184.205/api/devices/cmrd6v1nl07rlzyfi90vdjy5q/parameters \
  -H "Authorization: Bearer $(TOKEN)" \
  -H "Content-Type: application/json" \
  -d '{"parameters": {
    "Device.ManagementServer.URL": "http://179.51.184.205:7547/cwmp",
    "InternetGatewayDevice.ManagementServer.URL": "http://179.51.184.205:7547/cwmp"
  }}'
```

#### 1.4 Verificar XML gerado
- [ ] Logar o XML exato enviado para o CPE quando ocorre o Fault 9814
- [ ] Verificar se `fast-xml-parser` está gerando `<ParameterNames>` corretamente
- [ ] Testar com apenas 1 parâmetro para isolar o problema

---

## Problema 2: ZTE F670L — Sem parâmetros WiFi + Loop de conexão

### Diagnóstico
- CPE conecta a cada ~20 segundos (deveria ser a cada 300s)
- Nenhum parâmetro WLANConfiguration no banco
- CPE atrás de CGNAT (IP 100.64.7.216, IP público 179.51.186.216)
- ConnectionRequestURL: `http://179.51.186.216:58000/81ce22bb0b505d6fd1d357aadcabcd7d`
- VirtualParameters existem mas foram definidos manualmente

### Causa raiz do loop de conexão
1. ZTE envia Inform → ACS responde com MaxEnvelopes=2 (tasks pendentes)
2. ZTE faz POST vazio → ACS envia Provision (SetParameterValues)
3. ZTE processa → conecta de novo imediatamente
4. Provision gerado novamente porque `__provisionedAt__` pode não estar persistindo

### Ações Corretivas

#### 2.1 Parar loop de Provision (URGENTE)
**Arquivo:** `backend/src/acs/cwmp.service.ts`

- [ ] Verificar lógica de auto-provisionamento (linhas 377-432)
- [ ] Garantir que `__provisionedAt__` esteja sendo salvo corretamente no JSON `parameters`
- [ ] Adicionar verificação: se device já foi provisionado há menos de 1 hora, pular

**Código a modificar (~linha 378-385):**
```typescript
// ATUAL:
const isNewDevice = !device?.createdAt || (Date.now() - new Date(device.createdAt).getTime() < 120000);
const provisionedAt = (device?.parameters as any)?.__provisionedAt__;
const needsProvision = !provisionedAt || isNewDevice;

// CORREÇÃO - adicionar timeout entre reprovisionamentos:
const isNewDevice = !device?.createdAt || (Date.now() - new Date(device.createdAt).getTime() < 120000);
const provisionedAt = (device?.parameters as any)?.__provisionedAt__;
const provisionedElapsed = provisionedAt ? Date.now() - new Date(provisionedAt).getTime() : Infinity;
const needsProvision = (!provisionedAt || isNewDevice) && provisionedElapsed > 3600000; // 1h cooldown
```

#### 2.2 Iniciar descoberta de parâmetros WiFi para ZTE
**Arquivo:** `backend/src/acs/cwmp.service.ts`

- [ ] Verificar lógica de auto-discovery (linhas 437-463)
- [ ] Garantir que GetParameterNames esteja sendo criado para o ZTE
- [ ] Se necessário, forçar discovery para `InternetGatewayDevice.LANDevice.1.WLANConfiguration.`

**Via API:**
```bash
# Iniciar descoberta
curl -X POST http://179.51.184.205/api/devices/cmrc2kdn6000liuphgwpkscrj/discover

# Forçar leitura WiFi
curl -X POST http://179.51.184.205/api/devices/cmrc2kdn6000liuphgwpkscrj/wifi/read
```

#### 2.3 Corrigir tratamento de CGNAT
**Arquivo:** `backend/src/acs/cwmp.service.ts`

- [ ] ZTE atrás de CGNAT → ACS não consegue enviar Connection Request
- [ ] Solução: reduzir `PeriodicInformInterval` para 60s para garantir updates frequentes
- [ ] Garantir que tasks sejam processadas no próximo Inform (não dependam de CR)

#### 2.4 Adicionar detecção de loop de conexão
- [ ] Se device conecta > 10 vezes em 5 minutos sem completar tasks, pausar auto-provisionamento
- [ ] Logar alerta "Possível loop de conexão detectado"

---

## Problema 3: Arquitetura — Clientes Conectados

### Diagnóstico
- `handleGetConnectedDevices` (linha 1295-1344) procura clientes apenas em:
  `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.AssociatedDevice.{n}.*`
- TP-Link XX530v expõe clientes em:
  `Device.WiFi.AccessPoint.{i}.AssociatedDevice.{n}.*`

### Ações Corretivas

#### 3.1 Adicionar suporte TR-181 para Connected Devices
**Arquivo:** `backend/src/acs/cwmp.service.ts`

- [ ] Expandir `handleGetConnectedDevices` para buscar clientes também em:
  - `Device.WiFi.AccessPoint.{i}.AssociatedDevice.{n}.*` (TR-181)
  - `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.{i}.AssociatedDevice.{n}.*` (ZTE WIFI)

```typescript
// Adicionar no handleGetConnectedDevices (após loop WLANConfiguration):
for (let ap = 1; ap <= 16; ap++) {
  let devIndex = 1;
  while (true) {
    const basePath = `Device.WiFi.AccessPoint.${ap}.AssociatedDevice.${devIndex}`;
    const mac = str(params[`${basePath}.AssociatedDeviceMACAddress`]);
    if (!mac) break;
    connectedDevices.push({
      accessPoint: ap,
      mac,
      // ... campos equivalentes
    });
    devIndex++;
  }
}
```

#### 3.2 Adicionar leitura de AssociatedDevice na descoberta WiFi
- [ ] Incluir `Device.WiFi.AccessPoint.{i}.AssociatedDevice.{n}.*` nas tasks de WiFi read
- [ ] Detectar automaticamente qual namespace o CPE usa baseado nos parâmetros descobertos

---

## Problema 4: Melhorias no CWMP Service

### 4.1 Rate limiting de tasks
- [ ] Limitar número máximo de tasks PENDING por device (ex: max 20)
- [ ] Se exceder, não criar novas tasks até que as pendentes sejam processadas

### 4.2 Timeout de tasks
- [ ] Tasks em IN_PROGRESS por mais de 30 minutos devem ser resetadas para PENDING
- [ ] Tasks com mais de 5 tentativas devem ser marcadas como FAILED

### 4.3 Logging de XML enviado
- [ ] Adicionar log do XML completo enviado quando CPE retorna Fault
- [ ] Útil para debugging de Fault 9814 e outros erros de parsing

### 4.4 Namespace detection improvements
- [ ] Detectar TP-Link por `X_TP_` nos parâmetros descobertos
- [ ] Usar modelo de dados adequado baseado nos namespaces reais do CPE

---

## Problema 5: Segurança

### 5.1 Remover chaves SSH do repositório (CRÍTICO)
- [ ] Remover arquivos: `key`, `ssh_key`, `temp_key`, `temp_key_copy`
- [ ] Adicionar ao `.gitignore`: `key`, `ssh_key`, `temp_key*`, `*.pem`
- [ ] Rotacionar a chave SSH no servidor

### 5.2 Rotacionar secrets
- [ ] JWT_SECRET
- [ ] JWT_REFRESH_SECRET
- [ ] ACS_AUTH_PASSWORD

---

## Cronograma de Implementação

### Fase 1 — Estabilização (Dia 1-2)
| Prioridade | Tarefa | Esforço |
|-----------|--------|---------|
| 🔴 CRÍTICA | Parar loop de provision do ZTE (issue 2.1) | 30 min |
| 🔴 CRÍTICA | Limitar parâmetros por GetParameterValues (issue 1.1) | 1h |
| 🔴 CRÍTICA | Remover chaves SSH do repo (issue 5.1) | 15 min |
| 🟡 ALTA | Logar XML enviado em caso de Fault (issue 4.3) | 30 min |
| 🟡 ALTA | Rate limiting de tasks (issue 4.1) | 1h |

### Fase 2 — Funcionalidade WiFi (Dia 3-4)
| Prioridade | Tarefa | Esforço |
|-----------|--------|---------|
| 🟡 ALTA | Adicionar Connected Devices TR-181 (issue 3.1) | 2h |
| 🟡 ALTA | Forçar discovery WiFi ZTE (issue 2.2) | 1h |
| 🟡 ALTA | Incluir AssociatedDevice na leitura WiFi (issue 3.2) | 1h |
| 🟢 MÉDIA | Detection automática namespace (issue 4.4) | 2h |

### Fase 3 — Resiliência (Dia 5-6)
| Prioridade | Tarefa | Esforço |
|-----------|--------|---------|
| 🟡 ALTA | Timeout de tasks (issue 4.2) | 1h |
| 🟢 MÉDIA | Detecção de loop de conexão (issue 2.4) | 2h |
| 🟢 MÉDIA | Corrigir ConnectionRequestURL TP-Link (issue 1.2) | 1h |
| 🟢 MÉDIA | Rotacionar secrets (issue 5.2) | 30 min |

### Fase 4 — Verificação (Dia 7)
| Prioridade | Tarefa | Esforço |
|-----------|--------|---------|
| 🟡 ALTA | Testar leitura WiFi TP-Link XX530v | 1h |
| 🟡 ALTA | Testar leitura WiFi ZTE F670L | 1h |
| 🟢 MÉDIA | Verificar Connected Devices em ambos | 1h |
| 🟢 MÉDIA | Validar que loop de conexão parou | 30 min |

---

## Arquivos a Modificar

### Backend
| Arquivo | Alterações |
|---------|-----------|
| `backend/src/acs/cwmp.service.ts` | GetParameterValues limit, TP-Link TR-181, Connected Devices, provision loop fix, logging |
| `backend/src/devices/devices.service.ts` | Virtual parameters para TP-Link TR-181 |
| `backend/src/system-config/config.service.ts` | Adicionar timeout de provision |

### Infraestrutura
| Arquivo | Alterações |
|---------|-----------|
| `.gitignore` | Adicionar `key`, `ssh_key`, `temp_key*`, `*.pem` |
| `docker-compose.yml` | (se necessário) Ajustes de healthcheck |

---

## Comandos de Verificação

```bash
# 1. Verificar status dos containers
docker ps

# 2. Verificar logs do backend em tempo real
docker logs tr069-backend --tail 50 -f

# 3. Verificar dispositivos via API
curl -s http://179.51.184.205/api/devices | jq '.data[] | {serial, manufacturer, status, lastInform}'

# 4. Verificar tasks pendentes
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT deviceId, type, status, COUNT(*) FROM Task GROUP BY deviceId, type, status ORDER BY deviceId;"

# 5. Verificar parâmetros WiFi do TP-Link
curl -s http://179.51.184.205/api/devices/cmrd6v1nl07rlzyfi90vdjy5q/parameters | jq '.[] | select(.key | contains("WiFi"))'

# 6. Verificar se provision loop parou (ZTE)
docker logs tr069-backend --tail 200 | grep -c "Auto-provisioning device ZTE0QJNQ1407460"
```

---

## Rollback Plan

Se as alterações causarem instabilidade:
1. Reverter o commit com `git revert HEAD`
2. Rebuild dos containers: `docker compose up -d --build`
3. Verificar logs: `docker logs tr069-backend --tail 50`

---

*Plano gerado em 13/07/2026 — Baseado em análise do código, logs do servidor e API.*
