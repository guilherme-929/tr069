# TR-069 ACS Enterprise

Sistema completo de gerenciamento TR-069 (ACS - Auto Configuration Server) para provedores de internet (ISPs).

## 🚀 Stack

### Backend
- **Node.js** + **TypeScript** (NestJS + Fastify)
- **Prisma ORM** + **PostgreSQL**
- **Redis** + **BullMQ** para filas
- **WebSocket** para atualizações em tempo real
- **JWT** + **RBAC** para autenticação e autorização

### Frontend
- **React 18** + **TypeScript** + **Vite**
- **TailwindCSS** + **shadcn/ui**
- **TanStack Query** + **Zustand**
- **Recharts** para gráficos
- **Framer Motion** para animações

### Infraestrutura
- **Docker Compose** (frontend, backend, postgres, redis, nginx)
- **Nginx** como reverse proxy
- Healthcheck em todos os containers

## 📋 Funcionalidades

1. **Autenticação** - Login JWT com RBAC (Admin, Técnico, Operador, Leitura)
2. **ACS / TR-069** - Servidor CWMP com suporte a Inform, Get/Set Parameters, Reboot, Download, Upload
3. **Dashboard** - Cards, gráficos, tabelas, alertas em tempo real
4. **Dispositivos** - Gerenciamento completo de CPEs com filtros e painel lateral
5. **Modelos** - Cadastro de modelos com parâmetros TR-069 padrão
6. **Firmware** - Upload, versionamento, distribuição em massa
7. **Provisionamento** - Templates, presets, provisionamento automático
8. **Clientes** - Cadastro com vínculo de dispositivos
9. **Logs** - Auditoria completa com busca e exportação
10. **Alertas** - Notificações por WebSocket, email e webhook

## 🏁 Início Rápido

### Pré-requisitos
- Docker e Docker Compose

### Instalação

```bash
# Clone o repositório
git clone https://github.com/your-org/tr069-acs.git
cd tr069-acs

# Copie as variáveis de ambiente
cp .env.example .env

# Inicie os containers
docker-compose up -d

# Execute as migrations e seed
docker-compose exec backend npx prisma db push
docker-compose exec backend npx prisma db seed

# Acesse:
# - Frontend: http://localhost
# - API Docs: http://localhost/api/docs
# - ACS CWMP: http://localhost:7547/cwmp
```

### Credenciais de Acesso

| Email | Senha | Perfil |
|-------|-------|--------|
| admin@acs.local | admin123 | Admin |
| tecnico@acs.local | tech123 | Técnico |
| operador@acs.local | oper123 | Operador |

## 🐳 Docker Compose

```bash
# Iniciar todos os serviços
docker-compose up -d

# Ver logs
docker-compose logs -f backend

# Parar serviços
docker-compose down

# Recriar containers
docker-compose up -d --build
```

## 📚 API Endpoints

### Autenticação
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Registrar
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/profile` - Perfil do usuário

### Dispositivos
- `GET /api/devices` - Listar dispositivos
- `GET /api/devices/:id` - Detalhes do dispositivo
- `PATCH /api/devices/:id` - Atualizar dispositivo
- `DELETE /api/devices/:id` - Remover dispositivo
- `POST /api/devices/:id/reboot` - Reiniciar dispositivo
- `POST /api/devices/:id/reset` - Reset de fábrica
- `POST /api/devices/:id/parameters` - Get parameters
- `PUT /api/devices/:id/parameters` - Set parameters

### Modelos
- `GET /api/models` - Listar modelos
- `POST /api/models` - Criar modelo
- `PUT /api/models/:id` - Atualizar modelo
- `DELETE /api/models/:id` - Remover modelo

### Firmware
- `GET /api/firmware` - Listar firmware
- `POST /api/firmware` - Upload firmware
- `PUT /api/firmware/:id` - Atualizar firmware
- `DELETE /api/firmware/:id` - Remover firmware

### Provisionamento
- `POST /api/provisioning/device/:id` - Provisionar dispositivo
- `POST /api/provisioning/bulk` - Provisionamento em massa
- `GET /api/provisioning/tasks` - Listar tasks

### Clientes
- `GET /api/clients` - Listar clientes
- `POST /api/clients` - Criar cliente
- `GET /api/clients/:id` - Detalhes do cliente

### Logs
- `GET /api/logs` - Listar logs
- `GET /api/logs/export` - Exportar logs

### Alertas
- `GET /api/alerts` - Listar alertas
- `POST /api/alerts/:id/resolve` - Resolver alerta

## 📁 Estrutura do Projeto

```
/
├── frontend/          # React + Vite + TypeScript
│   ├── src/
│   │   ├── components/   # Componentes reutilizáveis
│   │   ├── pages/        # Páginas da aplicação
│   │   ├── stores/       # Zustand stores
│   │   ├── hooks/        # Custom hooks
│   │   └── lib/          # Utilitários e API client
│   └── ...
├── backend/           # NestJS + Fastify + TypeScript
│   ├── src/
│   │   ├── auth/         # Autenticação JWT
│   │   ├── acs/          # Servidor ACS/TR-069
│   │   ├── devices/      # Gerenciamento de dispositivos
│   │   ├── models/       # Modelos de dispositivos
│   │   ├── firmware/     # Firmware management
│   │   ├── provisioning/ # Provisionamento
│   │   ├── clients/      # Clientes
│   │   ├── logs/         # Logs e auditoria
│   │   ├── alerts/       # Alertas e notificações
│   │   ├── websocket/    # WebSocket gateway
│   │   └── queue/        # BullMQ queue
│   ├── prisma/
│   │   ├── schema.prisma # Schema do banco
│   │   └── seed.ts       # Dados de seed
│   └── ...
├── nginx/             # Configuração do Nginx
├── docker-compose.yml # Orquestração Docker
└── .env              # Variáveis de ambiente
```

## 🔒 Segurança

- JWT com refresh token
- RBAC com 4 níveis de acesso
- Rate limiting
- Helmet headers
- Validação com Zod
- Proteção CSRF/XSS
- Auditoria de ações
- Bcrypt para senhas

## 📊 Performance

- Paginação em todas as listagens
- Cache Redis
- Lazy loading
- Virtualização de tabelas
- Debounce em buscas
- WebSocket otimizado

## 🤝 Contribuição

1. Fork o projeto
2. Crie sua branch (`git checkout -b feature/amazing-feature`)
3. Commit suas mudanças (`git commit -m 'feat: add amazing feature'`)
4. Push para a branch (`git push origin feature/amazing-feature`)
5. Abra um Pull Request

## 📝 Licença

MIT
