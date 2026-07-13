# Documentação Completa — TR-069 ACS Enterprise

## 1. Visão Geral do Projeto

**TR-069 ACS Enterprise** é um Auto Configuration Server (ACS) completo para provedores de internet (ISPs) gerenciarem CPEs (roteadores/modems/ONT) via protocolo TR-069/CWMP.

### Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| **Backend** | Node.js 20, NestJS 10 + Fastify, TypeScript 5.4 (strict) |
| **Frontend** | React 18, TypeScript, Vite 5, TailwindCSS 3 |
| **BD** | PostgreSQL 16 + Prisma ORM 5.14 |
| **Cache/Fila** | Redis 7 + BullMQ 5 |
| **Auth** | JWT + Passport + bcrypt + RBAC (4 roles) |
| **Tempo Real** | WebSocket (ws library) |
| **XML** | fast-xml-parser |
| **Orquestração** | Docker Compose (5 containers) |
| **Proxy** | Nginx (reverse proxy) |
| **CI/CD** | GitHub Actions |

### Containers Docker

| Container | Portas | Função |
|-----------|--------|--------|
| `tr069-postgres` | 5432 | Banco de dados PostgreSQL |
| `tr069-redis` | 6379 | Cache e fila BullMQ |
| `tr069-backend` | 3000 (API), 7547 (ACS CWMP) | Servidor de aplicação |
| `tr069-frontend` | 5173:80 | UI React (SPA) |
| `tr069-nginx` | 80 | Reverse proxy |

### Rede
- IP público do servidor: **179.51.184.205**
- Rede Docker interna: `tr069-network` (bridge)
- URL pública ACS: `http://179.51.184.205:7547/cwmp`
- URL pública API: `http://179.51.184.205/api`

---

## 2. Arquitetura do Sistema

### Fluxo de Dados (CPE → Web)

```
CPE (roteador) ──Inform (SOAP/XML)──▶ [Backend :7547] AcsController
                                             │
                                    CwmpService.handleInform()
                                             │
                          ┌──────────────────┼──────────────────┐
                          ▼                  ▼                  ▼
                     PostgreSQL         WebSocket           Redis/BullMQ
                  Device.parameters   device:inform       Task Queue
                  Session, Event      (frontend LIVE)    GetParameterValues
                  Log, Task                              SetParameterValues
                                                         Provision
                                             │
                          ┌──────────────────┘
                          ▼
                   [Backend :3000] REST API
                          │
                   DevicesController
                   GET /api/devices/:id
                   POST /api/devices/:id/wifi/read
                          │
                          ▼
                   [Frontend React]
                   Dashboard, Devices.tsx, etc.
```

### Módulos do Backend (17 módulos)

| Módulo | Descrição |
|--------|-----------|
| **acs/** | Servidor CWMP (controller + service + cwmp.service.ts) — 1665 linhas |
| **auth/** | Autenticação JWT com RBAC |
| **devices/** | CRUD de dispositivos, parâmetros virtuais |
| **models/** | Modelos de CPE e descoberta de parâmetros |
| **firmware/** | Upload e gerenciamento de firmware |
| **provisioning/** | Provisionamento de dispositivos |
| **scripts/** | Presets/Provisions estilo GenieACS |
| **queue/** | Gerenciamento de fila BullMQ |
| **clients/** | Clientes ISP |
| **logs/** | Auditoria |
| **alerts/** | Alertas e notificações |
| **tenant/** | Multi-tenancy |
| **websocket/** | Gateway de tempo real |
| **system-config/** | Configurações dinâmicas |

### Schema do Banco (13 modelos Prisma)

| Modelo | Campos Principais | Propósito |
|--------|-------------------|-----------|
| `Tenant` | id, name, slug, acsUsername, acsPassword | Isolamento multi-ISP |
| `User` | id, email, password, role (ADMIN/TECHNICIAN/OPERATOR/READONLY) | Autenticação |
| `Device` | serial, mac, manufacturer, modelName, firmwareVersion, status, parameters (JSON), connectionRequestUrl | CPE |
| `DeviceModel` | manufacturer, name, dataModel, defaultParameters | Definição de modelo |
| `Firmware` | version, status, fileName, filePath | Gerenciamento de firmware |
| `Session` | deviceId, event, data | Sessões TR-069 |
| `Task` | deviceId, type, status (PENDING/IN_PROGRESS/COMPLETED/FAILED), payload | Fila de comandos |
| `Event` | deviceId, code, data | Eventos do dispositivo |
| `Log` | action, entity, detail | Trilha de auditoria |
| `Client` | name, document, contract, plan | Cliente ISP |
| `Alert` | type, severity | Alertas |
| `Script` | name, type (provision/preset), precondition, script, actions | Presets/Provisions |
| `Config` | key, value, category | Config dinâmica |

---

## 3. API Endpoints

### Autenticação
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/login` | Login (email + password) |
| POST | `/api/auth/refresh` | Refresh token |
| GET | `/api/auth/profile` | Perfil do usuário |

### ACS / CWMP
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/cwmp` | Endpoint CWMP (CPE → ACS) |
| GET | `/api/acs/stats` | Estatísticas do dashboard |
| GET | `/api/acs/provisioning-per-hour` | Provisionamento por hora |
| GET | `/api/acs/network-availability` | Disponibilidade de rede |

### Dispositivos
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/devices` | Lista paginada de CPEs |
| GET | `/api/devices/:id` | Detalhes do dispositivo |
| PATCH | `/api/devices/:id` | Atualizar dispositivo |
| DELETE | `/api/devices/:id` | Remover dispositivo |
| POST | `/api/devices/:id/reboot` | Reiniciar CPE |
| POST | `/api/devices/:id/reset` | Reset de fábrica |
| POST | `/api/devices/:id/update` | Atualizar firmware |
| POST | `/api/devices/:id/parameters` | GetParameterValues |
| PUT | `/api/devices/:id/parameters` | SetParameterValues |
| POST | `/api/devices/:id/wifi` | Set WiFi SSID/senha |
| POST | `/api/devices/:id/wifi/read` | Read WiFi config |
| POST | `/api/devices/:id/wifi/enable` | Enable/disable WiFi |
| POST | `/api/devices/:id/discover` | Iniciar descoberta |
| GET | `/api/devices/:id/discover/status` | Status da descoberta |
| GET | `/api/devices/:id/connected-devices` | Clientes conectados |
| GET | `/api/devices/:id/virtual-params` | Parâmetros virtuais |
| POST | `/api/devices/:id/connection-request` | Enviar CR |
| POST | `/api/devices/:id/fetch-all` | Fetch todos parâmetros |

### Outros Módulos
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | `/api/models` | CRUD modelos |
| GET/POST | `/api/firmware` | CRUD firmware |
| GET/POST | `/api/clients` | CRUD clientes |
| GET | `/api/logs` | Listar logs |
| GET/POST | `/api/alerts` | Gerenciar alertas |
| GET/POST | `/api/scripts` | CRUD scripts (presets/provisions) |
| GET/PUT | `/api/config` | Configurações do sistema |

---

## 4. Dispositivos em Produção

### Status atual (via API em 13/07/2026)

| Serial | Fabricante | Modelo | Firmware | Status | Último Inform |
|--------|-----------|--------|----------|--------|---------------|
| ZTE0QJNQ1407460 | ZTE | F670L | V9.0.11P1N52 | ONLINE | 12:19:06 |
| 22521Y0001317 | TP-Link | XX530v | 0.6.0 3.1.10 v60dc.0 Build 251231 Rel.46203n | ONLINE | 12:15:23 |
| V25A024003204 | TP-Link | XC220-G3 | 1.8.0 0.8.0 v6062.0 Build 251222 Rel.32348n | OFFLINE | 22:45:20 |

---

## 5. Diagnóstico Detalhado dos Problemas

### 5.1 TP-Link XX530v — Fault 9814 em GetParameterValues

**Sintoma:** CPE conecta, envia Inform, executa GetParameterNames (descoberta) com sucesso, mas falha em GetParameterValues com Fault 9814 "Parse xml string failed."

**O que funciona:**
- Conexão CWMP ✅
- Inform (envio de dados básicos) ✅
- GetParameterNames (descoberta de árvore de parâmetros) ✅

**O que falha:**
- GetParameterValues (leitura de valores específicos) ❌ → Fault 9814

**Causa raiz identificada:**
O TP-Link XX530v usa **TR-181** (Device.WiFi.*) como namespace principal. A descoberta encontra todas as 16 instâncias de SSID (1-16) e 16 AccessPoints. Quando o sistema tenta fazer GetParameterValues em lote com muitos parâmetros, o XML gerado pode:
1. **Ultrapassar o limite de tamanho de mensagem XML do CPE** (centenas de parâmetros em uma única requisição)
2. **Conter nomes de parâmetros que o CPE não reconhece** (paths que existem na descoberta mas não suportam leitura)
3. **Ter problema de namespace** (alguns CPEs TP-Link são rigorosos com o prefixo `cwmp:` em elementos filhos)

**Estrutura WiFi descoberta no TP-Link XX530v:**
```
Device.WiFi.Radio.1.        → Rádio 2.4GHz
Device.WiFi.Radio.2.        → Rádio 5GHz
Device.WiFi.SSID.1-16.      → SSIDs (1=2.4GHz, 2=5GHz, 3-16=convidados/IoT)
Device.WiFi.AccessPoint.1-16. → Access Points
Device.WiFi.AccessPoint.{i}.AssociatedDevice.{n}. → Clientes conectados
Device.WiFi.AccessPoint.{i}.Security.KeyPassphrase → Senha WiFi
```

**ConnectionRequestURL incorreta:**
- Atual: `http://179.51.184.17:7547/cwmp` (aponta para o ACS, não para o CPE)
- O CPE reporta ManagementServer.URL como `http://acs.local:7547/cwmp` (hostname interno)

### 5.2 ZTE F670L — Sem parâmetros WiFi

**Sintoma:** CPE conecta a cada ~20 segundos, mas parâmetros WiFi (SSID, senha, canais, clientes) nunca são populados no banco.

**O que funciona:**
- Conexão CWMP ✅
- Inform periódico ✅ (mas excessivo — a cada 20s em vez de 300s)
- Parâmetros básicos do device ✅
- Virtual Parameters (vWifi2G, vWifi5G definidos manualmente) ✅

**O que falta:**
- Nenhum parâmetro WLANConfiguration no banco ❌
- Nenhum AssociatedDevice ❌
- Tasks de GetParameterValues para WiFi nunca executadas ❌

**Causa raiz:**
O ZTE F670L está atrás de **CGNAT** (IP público 179.51.186.216, IP CGNAT 100.64.7.216). A ConnectionRequestURL contém IP CGNAT que o ACS não consegue alcançar. O CPE conecta a cada 20s porque:
1. O ACS envia MaxEnvelopes=2 (sinalizando que há tasks pendentes)
2. O CPE faz um segundo POST vazio (bodyLen=0) pedindo o próximo comando
3. O ACS envia uma task (GetParameterValues/Provision)
4. O CPE processa e conecta de novo, criando um loop
5. Ou: a sessão falha e o CPE retenta continuamente

**Evidência:** Logs mostram o ZTE conectando com bodyLen=2505 (Inform) seguido de bodyLen=0 (solicitando próximo comando) em intervalos de ~20s.

### 5.3 TP-Link XC220-G3 — Offline

**Sintoma:** CPE offline desde 12/07 22:45.

**Causa possível:**
- CPE desligado ou sem conexão de internet
- Configured ACS URL incorreta
- Firewall bloqueando porta 7547

---

## 6. Estrutura de Parâmetros WiFi por Fabricante

### TP-Link (TR-181) — XX530v e XC220-G3
```
Device.WiFi.Radio.{i}.                          → Radio (1=2.4GHz, 2=5GHz)
  OperatingFrequencyBand                          → "2.4GHz" | "5GHz"
  Channel                                         → Canal atual
  Enable/Status                                   → Ativado/Status
Device.WiFi.SSID.{i}.                           → SSID (1-16)
  SSID                                            → Nome da rede
  Enable/Status                                   → Ativado/Status
  BSSID                                           → MAC do BSSID
Device.WiFi.AccessPoint.{i}.                    → Access Point
  SSIDReference                                   → Referência ao SSID
  Security.KeyPassphrase                          → Senha WiFi
  AssociatedDevice.{n}.                           → Clientes conectados
    AssociatedDeviceMACAddress                    → MAC do cliente
    AssociatedDeviceIPAddress                     → IP do cliente
```

### ZTE (TR-098) — F670L
```
InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.
  SSID                                           → Nome da rede (i=1: 2.4GHz, i=5: 5GHz)
  KeyPassphrase                                  → Senha
  Channel                                        → Canal
  Enable/Status                                  → Ativado/Status
  Standard                                       → 802.11 b/g/n/ac
  X_ZTE-COM_OperatingFrequencyBand               → "2.4GHz" | "5GHz"
  AssociatedDevice.{n}.
    AssociatedDeviceMACAddress                    → MAC
    AssociatedDeviceIPAddress                     → IP
    X_ZTE-COM_AssociatedDeviceName               → Nome do host
```

---

## 7. Variáveis de Ambiente

```env
NODE_ENV=development
APP_NAME=tr069-acs
APP_PORT=3000
APP_HOST=0.0.0.0
DATABASE_URL=postgresql://acs:acs_secret@postgres:5432/tr069_acs?schema=public
REDIS_URL=redis://redis:6379
JWT_SECRET=bf2fef2d-4c7d-45ab-be80-2699d5eada11
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=bf2fef2d-4c7d-45ab-be80-2699d5eada11
JWT_REFRESH_EXPIRES_IN=7d
ACS_PORT=7547
ACS_ENDPOINT=/cwmp
ACS_AUTH_USERNAME=alemnet
ACS_AUTH_PASSWORD=bf2fef2d-4c7d-45ab-be80-2699d5eada11
ACS_PUBLIC_URL=http://179.51.184.205:7547
```

---

## 8. Credenciais de Acesso

### Sistema
| Email | Senha | Perfil |
|-------|-------|--------|
| admin@acs.local | admin123 | Admin |
| tecnico@acs.local | tech123 | Técnico |
| operador@acs.local | oper123 | Operador |

### ACS (CWMP Basic Auth)
- Username: `alemnet`
- Password: `bf2fef2d-4c7d-45ab-be80-2699d5eada11`

### PostgreSQL (interno Docker)
- Database: `tr069_acs`
- User: `acs`
- Password: `acs_secret`

---

## 9. Artefatos do GenieACS Legacy

Extraídos do GenieACS original em `http://179.51.184.205:3333`:

| Arquivo | Conteúdo |
|---------|----------|
| `genieacs_config_full.json` | Configurações de UI (264 linhas) |
| `genieacs_provisions.json` | 26 scripts de provisionamento |
| `genieacs_presets.json` | 18 presets com pré-condições |
| `seed-genieacs.js` | Conversor de provisions GenieACS → sistema custom |

### Presets importantes do GenieACS
| Preset | Gatilho | Ação |
|--------|---------|------|
| reboot | Tags.reboot | Reboot do CPE |
| summon | Tags.summon | Refresh forçado de parâmetros |
| TrocaOLT | Tags.OLT | Trocar username OLT |
| TrocaPadrao | Tags.troca | Desativar NAT25 |
| FWUPgrade_* | Modelo+versão | Upgrade de firmware |

---

## 10. Scripts de Diagnóstico (no projeto)

| Script | Função |
|--------|--------|
| `explore_genieacs.py` | Explora GenieACS NBI |
| `setup_cpe_session.py` | Helper para sessão manual em CGNAT |
| `discover_device.py` | Inicia descoberta de parâmetros |
| `discover_params.py` | Ferramenta de descoberta |
| `check_wifi_inform.py` | Verifica WiFi no Inform |
| `deep_check_zte.py` | Diagnóstico específico ZTE |
| `monitor_5ghz.py` | Monitora WiFi 5GHz |
| `trigger_fix_zte.py` | Aplica correção ZTE |
| `test_devices_api.py` | Testa API de dispositivos |
| `check_api.py` | Verifica saúde da API |
| `fetch_genieacs_config.py` | Extrai config do GenieACS |

---

## 11. Observações de Segurança

### ⚠️ Chaves SSH expostas no repositório
Quatro cópias da mesma **RSA Private Key** estão em plaintext:
- `key`, `ssh_key`, `temp_key`, `temp_key_copy`

**Risco:** Qualquer pessoa com acesso ao repositório pode autenticar como root no servidor `179.51.184.205`.

**Ação necessária:** Rotacionar a chave imediatamente e remover os arquivos do repositório (adicionar ao `.gitignore`).

### JWT Secret
`JWT_SECRET=bf2fef2d-4c7d-45ab-be80-2699d5eada11` — exposto no `.env` do repositório.

---

## 12. Comandos Úteis

```bash
# Ver logs do backend
docker logs tr069-backend --tail 100 -f

# Ver dispositivos online
curl -s http://179.51.184.205/api/devices?status=ONLINE

# Ver tasks pendentes de um device
curl -s http://179.51.184.205/api/devices/{id}

# Iniciar descoberta de parâmetros
curl -X POST http://179.51.184.205/api/devices/{id}/discover

# Ler WiFi
curl -X POST http://179.51.184.205/api/devices/{id}/wifi/read

# Chamar Connection Request
curl -X POST http://179.51.184.205/api/devices/{id}/connection-request

# SSH no servidor
ssh -i key root@179.51.184.205

# Executar SQL no Postgres Docker
docker exec -i tr069-postgres psql -U acs -d tr069_acos
```

---

*Documento gerado em 13/07/2026 — TR-069 ACS Enterprise v2.4*
