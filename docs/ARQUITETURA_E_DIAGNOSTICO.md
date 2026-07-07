# Documentação do Sistema — TR-069 ACS Enterprise

> Documento gerado antes do processo de verificação e correção.
> Objetivo: descrever a arquitetura, o fluxo de dados do CPE até a interface web e
> identificar os pontos críticos relacionados ao problema relatado:
> **"as informações do CPE não aparecem na parte web; não aparece o Wi-Fi nem os
> clientes conectados".**

---

## 1. Visão Geral

Plataforma ACS (Auto Configuration Server) TR-069 para provedores de internet (ISP),
composta por:

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Backend | NestJS + Fastify + TypeScript |
| Banco de dados | PostgreSQL via Prisma ORM |
| Fila / Cache | Redis + BullMQ |
| Tempo real | WebSocket (gateway NestJS) |
| Proxy | Nginx (reverse proxy) |
| Orquestração | Docker Compose (postgres, redis, backend, frontend, nginx) |

O sistema implementa o protocolo **CWMP** (TR-069) escutando na porta `7547`
(`/cwmp`). Cada CPE (roteador/cliente) envia mensagens `Inform` periódicas; o backend
processa, persiste em `Device.parameters` (JSON) e o frontend consome via API REST.

---

## 2. Arquitetura de Componentes

```
 CPE (roteador)
   │  Inform / GetParameterValuesResponse / ... (CWMP/SOAP sobre HTTP)
   ▼
 [Backend :7547] AcsController -> CwmpService.handleCwmp()
   │  persiste em PostgreSQL (Device, Session, Event, Task, Log)
   │  emite WebSocket (device:inform)
   ▼
 [Backend :3000] DevicesController / DevicesService
   │  GET /api/devices, GET /api/devices/:id, POST /api/devices/:id/wifi/read, ...
   ▼
 [Frontend React] pages/Devices.tsx -> abas Overview / TR-069 Params / Network /
   WiFi / Clients / Discovery / Logs
```

### Módulos backend (`backend/src`)
- `acs/` — servidor CWMP (controller, service, `cwmp.service.ts`)
- `devices/` — CRUD e leitura de parâmetros/virtual-params/clientes conectados
- `models/` — modelos de CPE e descoberta de parâmetros
- `firmware/`, `provisioning/`, `clients/`, `logs/`, `alerts/`
- `scripts/` — presets/provisions estilo GenieACS
- `websocket/` — gateway de tempo real
- `queue/` — BullMQ
- `system-config/` — configs (ex.: `cwmp.inform.interval`)

### Schema de dados relevante (`prisma/schema.prisma`)
- `Device.parameters` (Json) — armazena **todos** os parâmetros TR-069 reportados.
  É a fonte única de verdade para a UI.
- `Device.__discovered__` — metadados de descoberta recursiva (objects/leaves/values).
- `Device.connectionRequestUrl` — usado para acordar o CPE (Connection Request).
- `Task` — fila de comandos (Reboot, GetParameterValues, SetParameterValues, etc.).
- `Event` / `Session` / `Log` — histórico e auditoria.

---

## 3. Fluxo de Dados: do CPE até a Web

### 3.1 Chegada dos dados (`cwmp.service.ts`)
1. CPE envia `Inform`. `CwmpService.handleInform()` extrai serial, MAC, fabricante,
   modelo, firmware, uptime e **os parâmetros do Inform** (`paramMap`).
2. Os parâmetros são gravados em `Device.parameters` (merge com o que já existe).
3. Criado `Session`, `Event`, `Log`; emitido `device:inform` via WebSocket.
4. Se a URL do ACS estiver errada, cria `Task` do tipo `Provision` para corrigir.
5. Executa presets/provisions (scripts) e, se houver tasks pendentes, responde ao CPE
   com `MaxEnvelopes: 2` para que ele solicite o próximo comando.

> **Atenção:** O `Inform` só traz um subconjunto de parâmetros (os declarados no
> `ParameterList` do CPE). **Wi-Fi (SSID/KeyPassphrase) e clientes associados
> normalmente NÃO vêm no Inform** — precisam ser buscados via `GetParameterValues`,
> que só ocorre quando há uma `Task` pendente e o CPE reconecta.

### 3.2 Leitura de Wi-Fi (`handleReadWiFiConfig`)
- Endpoint: `POST /api/devices/:id/wifi/read`
- Lógica (`cwmp.service.ts:755`):
  - Se os parâmetros WLAN já estão em cache E completos (SSID + senha para cada
    instância conhecida) → retorna `source: 'cache'`.
  - Caso contrário → cria `Task` `GetParameterValues` com os paths WLAN e retorna
    `source: 'pending'` ("buscando do CPE...").
- O CPE só responde quando reconectar (Inform ou Connection Request). A UI mostra
  "pending" até o valor chegar.

### 3.3 Clientes conectados (`handleGetConnectedDevices`)
- Endpoint: `GET /api/devices/:id/connected-devices`
- Lê de `Device.parameters` os paths
  `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{wlan}.AssociatedDevice.{i}.*`
  (MAC, RSSI, IP, etc.).
- **Só funciona se esses parâmetros já tiverem sido buscados do CPE** (via discover/
  wifi/read). Se o cache estiver vazio, a lista vem vazia.

### 3.4 UI (`frontend/src/pages/Devices.tsx`)
- Lista de dispositivos: `GET /api/devices`.
- Painel lateral: `GET /api/devices/:id` (dados + parameters + tasks/events).
- Aba **WiFi**: usa `parameters` + `discoveryStatus.wifiParams`; se vazio, mostra
  "No WiFi parameters found. Click 'Discover All WiFi Params'".
- Aba **Clients**: usa `GET /api/devices/:id/connected-devices`; se vazio, mostra
  "No connected clients found".
- Aba **Overview**: seção Wi-Fi só aparece se `virtualParams.wifiBands` ou
  `parameters[...WLANConfiguration.1.SSID]` existirem.

---

## 4. Diagnóstico do Problema Reportado

**Sintoma:** o CPE aparece cadastrado, mas na web não aparecem: dados do CPE, Wi-Fi e
clientes conectados.

Causas mais prováveis (a serem verificadas na fase de correção):

1. **Parâmetros não persistidos / vazios em `Device.parameters`.**
   - O `Inform` chegou mas o `paramMap` veio vazio, ou o CPE não envia Wi-Fi no Inform.
   - Verificar no banco: `SELECT parameters FROM "Device" WHERE serial = '...'`.

2. **Tasks de `GetParameterValues` nunca executadas.**
   - `handleReadWiFiConfig` cria a Task, mas o CPE não reconecta para processá-la
     (sem Connection Request funcional, sem Inform periódico).
   - Verificar `Task` com `status: 'PENDING'` e `type: 'GetParameterValues'`.

3. **`connectionRequestUrl` ausente/inválido.**
   - Sem CR válido, o backend não consegue "acordar" o CPE para buscar Wi-Fi/clientes.
   - Botão "CR" fica desabilitado quando `selected.connectionRequestUrl` é nulo.

4. **CPE rejeita `GetParameterNames`/`GetParameterValues` (Fault 9005).**
   - Observado no código (comentário linha 1090) para modelos ZTE. A descoberta
     falha e os parâmetros nunca chegam.

5. **Filtro/múltiplos tenants (`tenantId`).**
   - O CWMP resolve tenant por `slug: 'default-isp'`. Se o seed usou outro slug e a
     UI loga em outro tenant, os dispositivos podem não aparecer.

6. **Dados em cache não propagados para a UI.**
   - `findOne` retorna `parameters`? A aba WiFi/Clients depende do `selected`
     atualizado após `selectDevice`.

---

## 5. Pontos de Inspeção (checklist para verificação/correção)

- [ ] Container `backend` recebe tráfego em `:7547` (log de `handleInform`).
- [ ] Registro do `Device` existe e `status = ONLINE`, `lastInform` recente.
- [ ] `Device.parameters` contém parâmetros não vazios (Inform).
- [ ] `Device.parameters` contém paths `*.WLANConfiguration.*.SSID` e
      `*.AssociatedDevice.*`.
- [ ] `Task` de `GetParameterValues` (Wi-Fi/clientes) existe e foi para `COMPLETED`.
- [ ] `Device.connectionRequestUrl` preenchido e acessível.
- [ ] `Tenant` correto entre CWMP (`default-isp`) e login da UI.
- [ ] Frontend faz `selectDevice` e renderiza a aba correta com dados.

---

## 6. Endpoints Relevantes

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/devices` | Lista paginada de CPEs |
| GET | `/api/devices/:id` | Detalhe (parameters, tasks, events) |
| POST | `/api/devices/:id/wifi/read` | Lê/ solicita Wi-Fi do CPE |
| POST | `/api/devices/:id/wifi` | Define SSID/senha Wi-Fi |
| GET | `/api/devices/:id/connected-devices` | Clientes associados (LAN/Wi-Fi) |
| GET | `/api/devices/:id/virtual-params` | Parâmetros virtuais (WAN, Wi-Fi) |
| POST | `/api/devices/:id/discover` | Inicia descoberta recursiva |
| GET | `/api/devices/:id/discover/status` | Status da descoberta |
| POST | `/api/devices/:id/connection-request` | Acorda o CPE (CR) |
| POST | `/api/devices/:id/reboot` `|reset` `|update` | Ações remotas |

---

## 7. Ambiente / Execução

- `docker-compose up -d` sobe postgres, redis, backend (`:3000`, `:7547`),
  frontend (`:5173` → nginx `:80`).
- Backend expõe Swagger em `/api/docs`.
- ACS CWMP em `http://<host>:7547/cwmp`.
- Seed define tenant `default-isp` e usuários admin/tecnico/operador.

---

## 8. Próximos Passos (fase de correção)

1. Confirmar persistência de `Device.parameters` via query no Postgres.
2. Garantir execução das Tasks `GetParameterValues` (reconexão do CPE / CR).
3. Validar caminhos de parâmetros Wi-Fi/clientes para o fabricante real do CPE
   (TR-098 vs TR-181; vendor extensions ZTE/Huawei/Intelbras).
4. Corrigir fallback de tenant se necessário.
5. Validar que `Devices.tsx` atualiza `selected` após `wifi/read` e `connected-devices`.

---
_Documento de referência para o ciclo de verificação e correção._
