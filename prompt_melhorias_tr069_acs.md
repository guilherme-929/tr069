# Prompt de Melhoria — TR-069 ACS Enterprise (foco: homologação de equipamentos, padrão GenieACS)

> Gerado a partir da análise do projeto `tr069.rar` (NestJS/Fastify + Prisma/Postgres + React).
> Use este documento como prompt para o Claude Code (ou outro agente/dev) executar as correções.

---

## 0. ⚠️ AÇÃO IMEDIATA — Segurança (antes de qualquer outra coisa)

O pacote enviado contém **chaves privadas SSH reais** na raiz do projeto:
`key`, `ssh_key`, `temp_key`, `temp_key_copy` (todas o mesmo par RSA de 3294 bytes) e o arquivo `.env` com secrets em texto puro (JWT_SECRET, JWT_REFRESH_SECRET, DATABASE_URL, ACS_AUTH_PASSWORD, SMTP_PASS).

O `.gitignore` já lista `key`, `ssh_key`, `temp_key*`, `.env` — ou seja, o time já identificou o risco (ver `docs/PLANO_DE_IMPLEMENTACAO.md`, item 5), mas os arquivos continuam presentes fisicamente no projeto/pacote distribuído.

**Faça agora, antes de tudo:**
1. Rotacione a chave SSH no(s) servidor(es) que a aceitam — considere-a comprometida.
2. Rotacione `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ACS_AUTH_PASSWORD`, credenciais de banco e SMTP.
3. Delete `key`, `ssh_key`, `temp_key`, `temp_key_copy` do disco e do histórico do Git (`git filter-repo` ou BFG), não só do working tree.
4. Nunca envie `.env` ou chaves dentro de `.rar`/`.zip` de entrega — exporte o projeto com `git archive` respeitando o `.gitignore`.

---

## 1. Diagnóstico geral do repositório

- **Higiene de repositório:** raiz do projeto tem **~107 scripts soltos** (`temp_*.sh/py`, `check_*.py`, `fix_*.py`, `verify_*.py`, `monitor_*.py`, `trigger_*.py`, `explore_*.py`) usados para depuração ad-hoc em produção. Isso indica que o troubleshooting está sendo feito "no braço" contra o servidor, sem tooling permanente.
- **Zero testes automatizados** no backend (`*.spec.ts` = 0 arquivos). Toda validação hoje é manual, via esses scripts soltos.
- **`cwmp.service.ts` com 1855 linhas** concentrando parsing SOAP, lógica de fault, provisionamento, descoberta, leitura de Wi-Fi e clientes conectados — um único "God Service".
- **Documentação interna é excelente** (`docs/ARQUITETURA_E_DIAGNOSTICO.md`, `PLANO_DE_IMPLEMENTACAO.md`, `TODO_GENIEACS_FEATURES.md`) e mostra que boa parte da Fase 1 do plano (loop de provisionamento do ZTE, truncamento de SetParameterValues para evitar Fault 9814, cancelamento de tasks em Fault 9814) **já foi implementada no código atual** — o que falta é consolidar isso em um processo repetível, não script avulso.

---

## 2. Bugs / gaps técnicos confirmados no código

1. **`discovery.service.ts::autoCreateModel`** grava `dataModel: 'TR-181'` **hardcoded**, mesmo quando os parâmetros descobertos usam o root `InternetGatewayDevice.*` (TR-098). Isso corrompe o cadastro de modelos legados/TR-098 (ex.: ZTE F670L, que é majoritariamente TR-098).
   - Corrigir: inferir `dataModel` a partir do prefixo dominante das chaves (`Device.` → TR-181, `InternetGatewayDevice.` → TR-098), com contagem de ocorrências, não apenas o primeiro match.

2. **Timeout de tasks travadas (item 4.2 do próprio plano) não implementado.** Não há job/cron que resete tasks em `IN_PROGRESS` há mais de X minutos ou que marque como `FAILED` após N tentativas. Sem isso, um CPE que trava no meio de uma sessão deixa a task "presa" indefinidamente.

3. **Rate limiting de tasks por device (item 4.1) parcial.** Existe cancelamento em cascata no Fault 9814, mas não há limite máximo de tasks `PENDING` por device nem backoff — um CPE problemático pode acumular tasks.

4. **Resolução de tenant frágil:** `resolveTenantId()` cai para `slug: 'default-isp'` ou "o primeiro tenant encontrado". Em ambiente multi-tenant real (múltiplos ISPs), isso pode associar modelos/discovery ao tenant errado silenciosamente.

5. **Mapeamento de extensões de fabricante espalhado em `if/else` dentro do `cwmp.service.ts`** (`X_ZTE-COM_*`, `X_TP_*`, etc.), em vez de uma tabela/estratégia por vendor — dificulta adicionar um fabricante novo sem tocar no core do CWMP.

---

## 3. O que falta para ficar no "padrão GenieACS" (funcionalidades)

Baseado no seu próprio `docs/TODO_GENIEACS_FEATURES.md`, os itens de maior impacto ainda pendentes:

- **Virtual Parameters** como conceito de primeira classe (hoje há `computeAndStoreVirtualParameters`, mas confirme cobertura total: vLoginPPPoE, vWAN1_IP, vWifi-2G/5G etc. para todos os fabricantes, não só os hardcoded).
- **Wi-Fi multi-banda completo** (`WLANConfiguration.1..8` e `Device.WiFi.SSID/AccessPoint.*` para TR-181) — hoje parcialmente coberto, mas validar cobertura por fabricante.
- **Connected Devices via TR-181** (`Device.WiFi.AccessPoint.{i}.AssociatedDevice.*`) além do TR-098 já existente.
- **Presets/Provisions com pré-condição por Tag** (estilo GenieACS: tag `reboot`, `summon`, `FWUpgrade_*` disparando ação automaticamente) — hoje as tags existem no schema, mas sem "gatilho" automático.
- **Dashboard com gráficos** (online/offline, por modelo, por tag, novos CPEs 24h) — ainda não implementado no frontend.

---

## 4. Módulo novo recomendado: **Homologação de Equipamentos**

Este é o gap mais importante para o seu objetivo específico (homologar equipamentos novos) e **não existe hoje no projeto** (busca por "homolog" no código retorna zero resultados). O GenieACS não tem esse conceito pronto — é algo que provedores maduros constroem por cima dele. Proposta:

### 4.1 Fingerprint automático na primeira conexão
Quando um `Device` novo (ou um `DeviceModel` desconhecido) faz o primeiro `Inform`, capturar e persistir automaticamente:
- Manufacturer, OUI, ProductClass, ModelName, HardwareVersion, SoftwareVersion
- Root data model detectado (TR-098 vs TR-181) — corrigindo o bug do item 2.1
- Resultado do `GetRPCMethods` (quais métodos o CPE realmente suporta)
- Se aceita `GetParameterNames` recursivo sem Fault 9005/9814 (indicador de "CPE bem comportado")

### 4.2 Status de homologação por `DeviceModel`
Adicionar ao schema `DeviceModel`:
```prisma
enum HomologationStatus {
  PENDING_REVIEW
  IN_TESTING
  APPROVED
  REJECTED
}

model DeviceModel {
  // ...campos existentes
  homologationStatus HomologationStatus @default(PENDING_REVIEW)
  homologationNotes  String?
  homologatedAt      DateTime?
  homologatedBy      String?
}
```
Regra de negócio: dispositivos de modelos `PENDING_REVIEW`/`IN_TESTING` **não recebem auto-provisionamento em massa** (apenas em ambiente de teste/tag `homolog`), evitando que um CPE novo e mal mapeado gere ruído em produção — o mesmo tipo de problema que já aconteceu com o ZTE F670L e o TP-Link XX530v.

### 4.3 Checklist de testes de homologação (playbook)
Criar uma entidade `HomologationChecklist` (ou reaproveitar `ScriptExecution`) com os testes padrão que todo modelo novo deve passar antes de `APPROVED`:
- [ ] Inform periódico chega e persiste em `Device.parameters`
- [ ] `GetParameterValues` completo sem Fault (com o batch size correto para o vendor)
- [ ] `SetParameterValues` (alterar SSID/senha) aplica e confirma no próximo Inform
- [ ] Wi-Fi 2.4GHz e 5GHz completos (SSID, canal, senha, status)
- [ ] Connected Devices (clientes associados) aparecem corretamente
- [ ] Connection Request funciona (ou fallback via `PeriodicInformInterval` curto se CGNAT)
- [ ] Reboot / FactoryReset respondem corretamente
- [ ] Download de firmware (se aplicável ao modelo)
- [ ] Sem loop de reconexão (>N informs/min)

### 4.4 Tabela de mapeamento de vendor extensions
Extrair os `if/else` de `X_ZTE-COM_*`, `X_TP_*` etc. do `cwmp.service.ts` para uma tabela versionada por `DeviceModel` (ou por `manufacturer`), permitindo que o processo de homologação de um CPE novo seja "preencher a tabela", não "editar o core do CWMP". Isso também resolve o ponto 3.4 do plano ("Namespace detection improvements") de forma estrutural, não como patch pontual.

### 4.5 Ferramenta de diff entre modelos
Tela/endpoint que compara os parâmetros descobertos de um modelo novo com um modelo já homologado do mesmo fabricante, destacando paths equivalentes (`WLANConfiguration.N` ↔ `Device.WiFi.SSID.N`) — acelera o trabalho manual de mapear um CPE desconhecido.

---

## 5. Prioridades sugeridas (ordem de execução)

| # | Prioridade | Item |
|---|-----------|------|
| 1 | 🔴 Crítica | Rotacionar chaves/secrets e remover `key`/`ssh_key`/`.env` do pacote e do git |
| 2 | 🔴 Crítica | Corrigir detecção `dataModel` (TR-098 vs TR-181) no `discovery.service.ts` |
| 3 | 🟡 Alta | Implementar timeout/retry de tasks travadas (item 4.2 do plano original) |
| 4 | 🟡 Alta | Modelo de dados + endpoints de **Homologação de Equipamentos** (seção 4) |
| 5 | 🟡 Alta | Extrair mapeamento de vendor extensions para tabela/config, fora do `cwmp.service.ts` |
| 6 | 🟢 Média | Cobrir testes automatizados mínimos (Jest) para `cwmp.service.ts` — hoje zero |
| 7 | 🟢 Média | Limpar a raiz do repo: mover scripts `temp_*/check_*/test_*` para `/tools/debug` ou remover |
| 8 | 🟢 Média | Dashboard com gráficos (online/offline, por modelo, por tag) — TODO já mapeado |
| 9 | ⚪ Baixa | Presets com trigger automático por tag (`reboot`, `summon`) |

---

## 6. Prompt pronto para o agente de desenvolvimento

```
Você é um dev sênior full-stack (NestJS/Fastify + Prisma/Postgres + React) trabalhando no
projeto TR-069 ACS Enterprise. O sistema segue o padrão GenieACS (Virtual Parameters,
Presets/Provisions, discovery de parâmetros).

Execute, nesta ordem:

1. SEGURANÇA: remova os arquivos `key`, `ssh_key`, `temp_key`, `temp_key_copy` do
   repositório e do histórico do git. Confirme que `.env` nunca é versionado. Não gere
   novas chaves — apenas eu farei a rotação manual no servidor.

2. Corrija `backend/src/models/discovery.service.ts::discoverDeviceModel` e
   `autoCreateModel` para detectar corretamente `dataModel` ('TR-098' vs 'TR-181')
   contando o prefixo dominante das chaves em `device.parameters`
   ('InternetGatewayDevice.' vs 'Device.'), em vez de hardcoded 'TR-181'.

3. Implemente um job (BullMQ) que roda a cada 5 min e:
   - move Tasks em IN_PROGRESS há mais de 30 min de volta para PENDING (retry++);
   - marca como FAILED tasks com retry >= 5.

4. Crie o módulo de Homologação de Equipamentos:
   - adicionar enum HomologationStatus e campos homologationStatus/homologationNotes/
     homologatedAt/homologatedBy em DeviceModel (migration Prisma);
   - endpoint POST /api/models/:id/homologation que atualiza o status;
   - endpoint GET /api/devices/:id/fingerprint que retorna manufacturer, OUI, productClass,
     modelName, hwVersion, swVersion, dataModel detectado, e resultado de GetRPCMethods;
   - bloquear auto-provisionamento em massa (handleInform) para DeviceModel com status
     PENDING_REVIEW ou IN_TESTING, a menos que o Device tenha a tag 'homolog';
   - criar tabela HomologationChecklist (ou reaproveitar ScriptExecution) com os itens
     do playbook (Inform ok, GetParameterValues completo, SetParameterValues, WiFi 2.4/5G,
     Connected Devices, Connection Request, Reboot, FactoryReset, sem loop de reconexão).

5. Extraia os mapeamentos de parâmetros específicos de fabricante (X_ZTE-COM_*, X_TP_*,
   X_HW_* etc.) de dentro de cwmp.service.ts para uma estrutura de configuração por
   manufacturer/model (arquivo ou tabela VendorParameterMap), mantendo o comportamento
   atual idêntico (não é refactor de lógica, é extração).

6. Adicione testes Jest cobrindo: parsing de Inform, tratamento de Fault 9814/9005,
   e o fix de dataModel do item 2.

Não altere o schema de Device, Task, Event, Log, Session, Client, Alert, Firmware, Config
além do necessário para os itens acima. Preserve o comportamento já corrigido de:
truncamento de SetParameterValues (evitar Fault 9814), cancelamento em cascata de tasks
em Fault 9814, e detecção de loop de reconexão (>8 eventos/5min).
```

---

## 7. Observação sobre o processo de homologação em si

Vale separar dois níveis de "homologação":
- **Homologação técnica no ACS** (seção 4 acima): garantir que o sistema reconhece e opera corretamente com o modelo novo.
- **Homologação regulatória/comercial** (Anatel, compatibilidade com sua rede, etc.): fora do escopo deste sistema — mas os dados coletados no fingerprint (seção 4.1) são exatamente o que normalmente se pede num relatório de homologação técnica para o time de operações aprovar um CPE novo em massa.
