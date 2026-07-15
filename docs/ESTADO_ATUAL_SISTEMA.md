# TR-069 ACS — Estado Atual do Sistema

> Gerado em: 14/07/2026
> Projeto: TR-069 ACS Enterprise (NestJS/Fastify + Prisma/Postgres + React)

---

## 1. Arquitetura

```
┌─────────────┐     ┌──────────┐     ┌───────────┐     ┌──────────────┐
│   Browser   │────▶│  Nginx   │────▶│  Frontend │     │  PostgreSQL  │
│  (React)    │     │  :80     │     │  :5173    │     │  :5432       │
└─────────────┘     └──────────┘     └───────────┘     └──────────────┘
                          │                                   ▲
                          ▼                                   │
                    ┌──────────┐     ┌───────────┐     ┌──────┴───────┐
                    │  Backend │────▶│   Redis   │────▶│   (BullMQ)   │
                    │  :3000   │     │  :6379    │     │  Task Queue  │
                    │  :7547   │     └───────────┘     └──────────────┘
                    └──────────┘
                         │
                         ▼
                    ┌──────────┐
                    │   CPEs   │
                    │ (TR-069) │
                    └──────────┘
```

### Containers (Docker Compose)
| Container | Porta | Função |
|-----------|-------|--------|
| tr069-postgres | 5432 | Banco de dados (PostgreSQL 16) |
| tr069-redis | 6379 | Cache/fila (Redis 7) |
| tr069-backend | 3000, 7547 | API REST + CWMP endpoint |
| tr069-frontend | 5173 | Frontend React |
| tr069-nginx | 80 | Proxy reverso |

---

## 2. Features Implementadas

### Core
- [x] Autenticação JWT (admin/technician/operator/readonly)
- [x] Multi-tenant (ISP isolation)
- [x] Descoberta automática de parâmetros (GetParameterNames recursivo)
- [x] Leitura de valores (GetParameterValues)
- [x] Escrita de parâmetros (SetParameterValues)
- [x] Provisionamento automático na primeira conexão
- [x] Virtual Parameters computados (vWifi2G, vWifi5G, vLoginPPPoE, vWAN1_IP, vIP_Voip)
- [x] Task queue com status PENDING → IN_PROGRESS → COMPLETED/FAILED

### WiFi
- [x] Leitura WiFi multi-namespace (TR-098 `WLANConfiguration.*`, TR-181 `Device.WiFi.*`, ZTE `WIFI.*`)
- [x] Auto-detecção TP-Link (prioriza TR-181 quando `X_TP_` presente)
- [x] Enable/disable WiFi por instância
- [x] Salvamento de SSID/senha
- [x] Clientes conectados por instância WiFi

### Homologação (NOVO)
- [x] `HomologationStatus` enum: `PENDING_REVIEW | IN_TESTING | APPROVED | REJECTED`
- [x] Campos `homologationStatus`, `homologationNotes`, `homologatedAt`, `homologatedBy` em DeviceModel
- [x] Endpoint `POST /api/models/:id/homologation` para atualizar status
- [x] Endpoint `GET /api/devices/:id/fingerprint` com fingerprint completo
- [x] Endpoint `GET /api/models/homologation/checklist`
- [x] Bloqueio de auto-provisionamento para modelos `PENDING_REVIEW`/`IN_TESTING`
- [x] Tag `homolog` permite bypass do bloqueio

### Task Management
- [x] Rate limiting (max 20 pending tasks por device)
- [x] Fault 9814 → cancela tasks pendentes do mesmo tipo
- [x] **Fault 9005 → split automático de parâmetros (NOVO)**
- [x] **Task timeout: cron a cada 5min (NOVO)**
  - Tasks `IN_PROGRESS` > 30min → voltam para `PENDING` (retry++)
  - Tasks com retry >= 5 → `FAILED`

### Data Model Detection (CORRIGIDO)
- [x] `autoCreateModel` agora infere `dataModel` (TR-098 vs TR-181) pela contagem de prefixos dominantes
- [x] Não mais hardcoded como `'TR-181'`

---

## 3. API — Endpoints Públicos

### Autenticação
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/login` | Login (email/senha → JWT) |

### Dispositivos
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/devices` | Listar dispositivos |
| GET | `/api/devices/:id` | Detalhes do dispositivo |
| GET | `/api/devices/:id/history` | Histórico de eventos |
| GET | `/api/devices/:id/virtual-params` | Virtual parameters computados |
| GET | `/api/devices/:id/fingerprint` | Fingerprint técnico (NOVO) |
| PATCH | `/api/devices/:id` | Atualizar dispositivo |
| PATCH | `/api/devices/:id/acs-config` | Configurar ACS URL/credentials |
| DELETE | `/api/devices/:id` | Remover dispositivo |

### Modelos
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/models` | Listar modelos |
| GET | `/api/models/:id` | Detalhes do modelo |
| POST | `/api/models` | Criar modelo |
| PUT | `/api/models/:id` | Atualizar modelo |
| DELETE | `/api/models/:id` | Remover modelo |
| POST | `/api/models/:id/discover` | Descobrir parâmetros do modelo |
| POST | `/api/models/:id/auto-model` | Auto-criar modelo a partir de device |
| POST | `/api/models/:id/homologation` | Atualizar status homologação (NOVO) |
| GET | `/api/models/homologation/checklist` | Checklist de homologação (NOVO) |

### Configuração
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/config?category=virtual` | Listar virtual params |
| POST | `/api/config` | Criar config |
| PATCH | `/api/config/:id` | Atualizar config |
| DELETE | `/api/config/:id` | Remover config |

### Provisionamento
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/provisioning/device/:id` | Provisionar dispositivo |

---

## 4. Dispositivos Homologados

| Modelo | Fabricante | Namespace | WiFi 2.4 | WiFi 5GHz | Status |
|--------|------------|-----------|----------|-----------|--------|
| F670L | ZTE | TR-098 (`WLANConfiguration.*`) | Instância 1 | Instância 5 | ✅ Operacional |
| XX530v | TP-Link | TR-181 (`Device.WiFi.SSID.*`) | Instância 1 | Instância 3 | ✅ Operacional |
| XC220-G3 | TP-Link | TR-181 + TR-098 misto | Instância 1 | Instância 3 | ✅ Operacional |

---

## 5. Tratamento de Faults Conhecidos

| Fault | Causa | Ação |
|-------|-------|------|
| **9814** | Parse XML string failed (namespace `cwmp:` ausente) | Cancela tasks pendentes do mesmo tipo |
| **9005** | Invalid parameter name (parâmetro não existe no CPE) | **Split automático**: divide parâmetros ao meio e retenta |
| **9003** | Invalid arguments (formato do valor incorreto) | Log + falha (requer ajuste manual do valor) |

---

## 6. Virtual Parameters

| Nome | Paths (ordem de busca) | Transform |
|------|------------------------|-----------|
| `vWifi2G` | `WLANConfiguration.1.SSID` → `Device.WiFi.SSID.1.SSID` | first |
| `vWifi5G` | `WLANConfiguration.5.SSID` → `WLANConfiguration.2.SSID` → `Device.WiFi.SSID.3.SSID` → `Device.WiFi.SSID.2.SSID` → `Device.WiFi.SSID.5.SSID` | first |
| `vLoginPPPoE` | Paths PPPoE | first |
| `vWAN1_IP` | Paths WAN IP | first |
| `vIP_Voip` | Paths VoIP SIP | first |

---

## 7. Segurança

- [x] Chaves SSH rotacionadas e removidas do repositório
- [x] `.env`, `*.pem`, `*.key`, `key`, `ssh_key`, `temp_key*` no `.gitignore`
- [x] JWT com expiração (15min default)
- [x] Roles: ADMIN, TECHNICIAN, OPERATOR, READONLY
- [x] Senhas em hash (bcrypt)

---

## 8. Pendências / Melhorias Futuras

| Prioridade | Item | Status |
|------------|------|--------|
| 🟢 Média | Testes automatizados (Jest) — hoje zero | 📝 Planejado |
| 🟢 Média | Dashboard com gráficos (online/offline, por modelo) | 📝 Planejado |
| 🟢 Média | Extrair vendor extensions para tabela/config (`X_ZTE-COM_*`, `X_TP_*`) | 📝 Planejado |
| 🟢 Média | Limpar scripts temporários da raiz (`temp_*`, `check_*`, `fix_*`) | 📝 Planejado |
| ⚪ Baixa | Presets com trigger automático por tag (reboot, summon) | 📝 Planejado |

---

## 9. Comandos Úteis

```bash
# Verificar containers
docker ps -a

# Logs do backend
docker logs tr069-backend --tail 50

# Acessar banco
docker exec -it tr069-postgres psql -U acs -d tr069_acs

# Rebuild total
cd /root/tr069 && docker compose build --no-cache backend && docker compose up -d

# Migration manual
docker exec tr069-postgres psql -U acs -d tr069_acs -c "ALTER TABLE ..."
```

---

## 10. Arquitetura de Arquivos (Backend)

```
backend/src/
├── acs/              # Core CWMP (SOAP parsing, tasks, fault handling)
│   └── cwmp.service.ts   # ~1868 linhas — God Service (parsing, provisionamento, WiFi)
├── auth/             # Autenticação JWT
├── common/           # PrismaService, guards, decorators
├── devices/          # CRUD devices, virtual params, connected devices
├── models/           # CRUD models, discovery, homologation (NOVO)
│   ├── discovery.service.ts   # Auto-descoberta e criação de modelos
│   ├── homologation.service.ts # Lógica de homologação (NOVO)
├── queue/            # Task queue + timeout service (NOVO)
│   ├── task-timeout.service.ts # Cron 5min para tasks presas (NOVO)
├── system-config/    # Configurações do sistema
├── websocket/        # WebSocket gateway
├── provisioning/     # Provisionamento de dispositivos
└── scripts/          # GenieACS-style scripts/presets
```
