# PROMPT — SISTEMA TR-069 / ACS ENTERPRISE
Você é um arquiteto de software e desenvolvedor full-stack sênior especializado em telecomunicações, ISPs, gerenciamento de CPEs e plataformas ACS/TR-069.

Seu objetivo é criar um sistema completo de gerenciamento TR-069 (ACS — Auto Configuration Server) com arquitetura moderna, escalável, segura e preparada para ambientes de produção de ISPs.

O sistema deverá ser desenvolvido com foco em:

* gerenciamento massivo de roteadores/CPEs
* provisionamento automático
* atualização de firmware em massa
* monitoramento em tempo real
* escalabilidade horizontal
* multi-tenant
* alta performance
* interface moderna e intuitiva
* suporte a milhares de dispositivos simultaneamente

---

# STACK OBRIGATÓRIA

## Backend

* Node.js (TypeScript)
* Fastify ou NestJS
* PostgreSQL
* Redis
* Docker
* Docker Compose
* Prisma ORM
* WebSocket para realtime
* JWT Authentication
* RBAC (controle de permissões)
* Queue system com BullMQ
* Logs estruturados

## Frontend

* React + TypeScript
* Vite
* TailwindCSS
* shadcn/ui
* TanStack Table
* Zustand
* React Query
* Framer Motion
* Chart.js ou Recharts

## Infraestrutura

* Docker Compose completo
* Containers separados:

  * frontend
  * backend
  * PostgreSQL
  * Redis
  * Nginx reverse proxy
* Variáveis via .env
* Healthcheck em todos os containers

---

# OBJETIVO DO SISTEMA

Criar uma plataforma ACS TR-069 profissional semelhante às soluções:

* GenieACS
* AVSystem
* Friendly Technologies
* Axiros

O sistema deve permitir:

* gerenciamento centralizado de CPEs
* provisionamento automático
* envio de comandos remotos
* atualização de firmware
* monitoramento de status
* gerenciamento de modelos
* logs completos
* automações
* controle de clientes
* métricas e dashboards

---

# FUNCIONALIDADES PRINCIPAIS

# 1. AUTENTICAÇÃO

Implementar:

* página de login moderna
* JWT
* refresh token
* sessão persistente
* recuperação de senha
* logout
* RBAC

Perfis:

* Admin
* Técnico
* Operador
* Somente leitura

Segurança:

* rate limit
* bcrypt
* proteção CSRF
* proteção XSS
* Helmet
* validação Zod

---

# 2. ACS / TR-069

Implementar servidor ACS funcional.

Compatível com:

* TR-069
* CWMP
* Provisionamento ACS

Suporte:

* Inform
* GetParameterValues
* SetParameterValues
* Reboot
* FactoryReset
* Download
* Upload
* GetRPCMethods

Gerenciar:

* sessões TR-069
* parâmetros
* eventos
* tasks
* jobs
* retries
* timeout
* autenticação CPE

Suporte aos fabricantes:

* ZTE
* Huawei
* Nokia
* Intelbras
* TP-Link
* FiberHome

---

# 3. DASHBOARD

Criar dashboard moderno com:

## Cards

* dispositivos online
* offline
* provisionados hoje
* falhas
* modelos cadastrados
* firmwares disponíveis

## Gráficos

* online vs offline
* provisionamentos por hora
* consumo ACS
* falhas por modelo
* uso de firmware

## Tabelas

* dispositivos recentes
* alertas
* atividades recentes
* provisionamentos pendentes

## Realtime

Atualização via WebSocket.

---

# 4. GERENCIAMENTO DE DISPOSITIVOS

Tela completa para gerenciamento de CPEs.

Campos:

* serial
* MAC
* modelo
* firmware
* status
* uptime
* cliente
* WAN IP
* sinal
* última conexão

Filtros:

* online/offline
* modelo
* firmware
* cliente
* tags
* tenant

Ações:

* reboot
* provisionar
* atualizar firmware
* reset
* sincronizar parâmetros
* remover

Detalhes do dispositivo:

* parâmetros TR-069
* WAN
* LAN
* Wi-Fi
* VoIP
* histórico
* logs
* eventos

---

# 5. MODELOS E FIRMWARE

## MODELOS

Cadastrar:

* fabricante
* modelo
* versão HW
* parâmetros padrão
* templates ACS
* scripts de provisionamento

## FIRMWARE

Gerenciar:

* upload
* associação por modelo
* versão padrão
* changelog
* atualização em massa
* rollback

Implementar:

* histórico de versões
* compatibilidade
* status:

  * latest
  * stable
  * deprecated

---

# 6. PROVISIONAMENTO

Criar sistema de provisionamento automatizado.

Funcionalidades:

* templates
* presets
* auto-provisionamento
* regras automáticas
* VLAN
* PPPoE
* Wi-Fi
* VoIP
* bridge/router mode

Provisionamento em massa:

* fila
* retries
* logs
* progresso realtime

---

# 7. CLIENTES

Cadastro de clientes:

* nome
* documento
* contrato
* dispositivos vinculados
* planos
* histórico
* tickets

---

# 8. LOGS E EVENTOS

Criar sistema completo de auditoria.

Registrar:

* login
* reboot
* alterações
* provisionamentos
* firmware
* erros ACS

Implementar:

* busca
* filtros
* exportação

---

# 9. ALERTAS

Alertas:

* dispositivo offline
* firmware antigo
* falha de provisionamento
* perda de sessão ACS
* reboot excessivo

Notificações:

* websocket
* email
* webhook

---

# 10. API

Criar API REST completa documentada.

Documentação:

* Swagger/OpenAPI

Rotas:

* auth
* devices
* firmware
* models
* tasks
* clients
* logs
* alerts

---

# 11. BANCO DE DADOS

Usar PostgreSQL com Prisma.

Criar schema completo.

Tabelas:

* users
* roles
* devices
* models
* firmware
* parameters
* tasks
* events
* logs
* clients
* sessions
* alerts
* tenants

Relacionamentos corretos e índices otimizados.

---

# 12. DOCKER

Criar docker-compose completo.

Containers:

* frontend
* backend
* postgres
* redis
* nginx

Adicionar:

* healthcheck
* restart policy
* network isolada
* persistência

---

# 13. DESIGN/UI

Criar interface premium.

Tema:

* dark/light
* minimalista
* moderna
* responsiva

Cores:

* primary: #4e9fff
* success: #22c55e
* danger: #ef4444
* warning: #f59e0b

---

# TELA — DASHBOARD

Implementar:

## Sidebar

* Dashboard
* Dispositivos
* Modelos
* Firmware
* Provisionamento
* Clientes
* Configurações

## Topbar

* busca global
* notificações
* avatar
* toggle dark/light

## Widgets

* online
* offline
* modelos
* firmware
* gráficos
* atividades
* alertas
* saúde da rede

---

# TELA — DISPOSITIVOS

Tabela moderna com:

* serial
* MAC
* modelo
* firmware
* status
* uptime
* sinal
* última conexão

Painel lateral:

* parâmetros TR-069
* WAN/LAN/Wi-Fi
* logs
* histórico
* comandos remotos

---

# TELA — MODELOS/FIRMWARE

Abas:

* modelos
* firmware

Modelos:

* cadastro
* associação de firmware
* parâmetros default

Firmware:

* upload drag-and-drop
* progresso
* changelog
* atualização automática

---

# UX/UI

Implementar:

* skeleton loading
* estados vazios
* toast notifications
* modais
* hover animations
* realtime updates
* transições suaves
* responsividade total

---

# DADOS MOCK

Gerar dados realistas:

* serials ZTE/Huawei
* parâmetros TR-069 reais
* logs técnicos
* firmwares
* clientes
* eventos

---

# ESTRUTURA DO PROJETO

Organizar projeto profissionalmente:

/frontend
/backend
/docker
/nginx
/docs

Separar:

* services
* repositories
* controllers
* hooks
* stores
* components
* pages

---

# QUALIDADE DO CÓDIGO

Obrigatório:

* TypeScript strict
* ESLint
* Prettier
* arquitetura limpa
* código modular
* componentes reutilizáveis
* comentários estratégicos
* tratamento global de erros

---

# PERFORMANCE

Implementar:

* paginação
* lazy loading
* cache Redis
* virtualização de tabelas
* debounce
* websocket otimizado

---

# SEGURANÇA

Implementar:

* JWT
* refresh token
* RBAC
* rate limit
* helmet
* validação
* sanitização
* auditoria
* proteção brute-force

---

# ENTREGA ESPERADA

Gerar:

1. Estrutura completa do projeto
2. Docker Compose funcional
3. Backend completo
4. Frontend completo
5. Banco PostgreSQL
6. Sistema ACS/TR-069 funcional
7. Interface moderna
8. APIs
9. Prisma schema
10. Scripts de inicialização
11. Seed do banco
12. README completo

O código deve ser:

* profissional
* escalável
* pronto para produção
* organizado
* visualmente premium
* funcional

Priorize:

* arquitetura
* qualidade visual
* UX
* escalabilidade
* organização
* telecom/ISP workflow real

Não entregue apenas layouts.
Implemente lógica real de negócio ACS/TR-069.
