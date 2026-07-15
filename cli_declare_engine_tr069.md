# CLI + Motor `declare()` (padrão GenieACS) — TR-069 ACS Enterprise

> Documento para você (ou seu agente de código) executar diretamente no projeto.
> Resolve dois problemas ao mesmo tempo:
> 1. **Fault 9005** — porque cria uma camada única que só pede ao CPE parâmetros já confirmados como existentes (igual ao GenieACS).
> 2. **Scripts soltos** — porque centraliza todo diagnóstico manual num CLI único (`pnpm cli ...`), substituindo os `check_*.py`/`temp_*.sh`.

Todo comando do CLI e toda leitura de Wi-Fi/discovery do CWMP passam a usar o **mesmo** `DeclareService` — exatamente como no GenieACS o `declare()` dentro de um provision e o `declare()` dentro do console usam o mesmo motor.

---

## 0. Como o GenieACS resolve isso (referência, baseado no seu próprio export)

No `genieacs_provisions.json` que você tinha, o preset `summon` faz:

```js
declare("InternetGatewayDevice", {value: now});
declare("InternetGatewayDevice.*", {value: now});
declare("InternetGatewayDevice.*.*", {value: now});
```

Ou seja: ele **nunca pula direto pro fim da árvore**. Ele desce nível por nível, e o motor do GenieACS só transforma um `declare()` em `GetParameterValues` real quando aquele path específico **já existe** na árvore descoberta daquele device (via `GetParameterNames` anterior). Se não existe ainda, o motor gera `GetParameterNames` primeiro.

O `DeclareService` abaixo replica essa lógica em cima do seu schema Prisma atual.

---

## 1. Instalar dependência do CLI

```bash
cd backend
pnpm add nest-commander
```

---

## 2. Migration Prisma — rastreamento de descoberta

Edite `backend/prisma/schema.prisma`:

```diff
 model Device {
   ...
   parameters      Json?
+  discoveredPaths Json?   // array de paths (leaf) confirmados via GetParameterNames
+  parameterMeta   Json?   // { "<path>": "2026-07-15T12:00:00.000Z" } -> última vez que o valor foi buscado
   connectionRequestUrl   String?
   ...
 }

 model DeviceModel {
   ...
   defaultParameters Json?
+  unsupportedParameters Json?  // array de paths que já retornaram Fault 9005 para este modelo
   defaultAcsUrl     String?
   ...
 }
```

Rode:

```bash
cd backend
npx prisma migrate dev --name add_discovery_tracking
npx prisma generate
```

---

## 3. Motor `declare()` — `backend/src/discovery-engine/declare.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export type DeclareResult = {
  status: 'cached' | 'refresh_scheduled' | 'discovery_scheduled' | 'unsupported';
  path: string;
  value?: string;
  taskId?: string;
};

/**
 * Motor central de leitura de parâmetros TR-069, inspirado no declare()
 * do GenieACS. Nunca pede ao CPE um path que ainda não foi confirmado
 * como existente — evita Fault 9005 ("Invalid parameter name").
 *
 * Regras:
 *  1. Se o path já foi marcado como "unsupported" para o DeviceModel,
 *     não pede de novo (equivalente à árvore persistente do GenieACS).
 *  2. Se o path é uma leaf conhecida (está em discoveredPaths) e o valor
 *     em cache tem menos de maxAgeMs, retorna do cache (sem gerar Task).
 *  3. Se é conhecida mas está velha, cria Task GetParameterValues.
 *  4. Se o path não é conhecido (nunca foi descoberto), cria Task
 *     GetParameterNames escopada no prefixo pai — SEM tentar ler o valor
 *     ainda. A próxima chamada (após o CPE responder) já vai cair no
 *     caso 2/3.
 */
@Injectable()
export class DeclareService {
  private readonly logger = new Logger(DeclareService.name);

  constructor(private prisma: PrismaService) {}

  async declare(
    deviceId: string,
    path: string,
    opts: { maxAgeMs?: number } = {},
  ): Promise<DeclareResult> {
    const maxAgeMs = opts.maxAgeMs ?? 3600_000; // default: 1h, igual ao preset "default" do GenieACS

    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error(`Device ${deviceId} not found`);

    // 1. Path já sabido como não suportado por esse modelo?
    if (device.modelId) {
      const model = await this.prisma.deviceModel.findUnique({ where: { id: device.modelId } });
      const unsupported = (model?.unsupportedParameters as string[]) || [];
      if (this.matchesAny(path, unsupported)) {
        this.logger.debug(`[DECLARE] ${path} marcado como unsupported para modelo ${model?.name} — pulando`);
        return { status: 'unsupported', path };
      }
    }

    const discovered = (device.discoveredPaths as string[]) || [];
    const isWildcard = path.includes('*');

    if (!isWildcard && discovered.includes(path)) {
      // 2/3. Path conhecido — checar idade do valor
      const meta = (device.parameterMeta as Record<string, string>) || {};
      const fetchedAt = meta[path] ? new Date(meta[path]).getTime() : 0;
      const isFresh = Date.now() - fetchedAt < maxAgeMs;

      if (isFresh) {
        const params = (device.parameters as Record<string, string>) || {};
        return { status: 'cached', path, value: params[path] };
      }

      const task = await this.createTask(device.id, device.tenantId, 'GetParameterValues', {
        parameterPaths: [path],
      });
      return { status: 'refresh_scheduled', path, taskId: task.id };
    }

    // 4. Path desconhecido (ou wildcard) — descobrir primeiro
    const scopePrefix = this.parentPrefix(path);
    const task = await this.createTask(device.id, device.tenantId, 'GetParameterNames', {
      parameterPath: scopePrefix,
      nextLevel: false, // recursivo — igual ao comportamento default do CWMP walk
    });
    this.logger.log(`[DECLARE] ${path} desconhecido — disparando discovery em ${scopePrefix} (task ${task.id})`);
    return { status: 'discovery_scheduled', path, taskId: task.id };
  }

  /** Chamado pelo cwmp.service.ts ao processar GetParameterNamesResponse com sucesso. */
  async recordDiscovery(deviceId: string, paths: string[]): Promise<void> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) return;
    const current = new Set((device.discoveredPaths as string[]) || []);
    for (const p of paths) current.add(p);
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { discoveredPaths: Array.from(current) },
    });
  }

  /** Chamado pelo cwmp.service.ts ao processar GetParameterValuesResponse com sucesso. */
  async recordValues(deviceId: string, values: Record<string, string>): Promise<void> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) return;
    const currentParams = (device.parameters as Record<string, any>) || {};
    const currentMeta = (device.parameterMeta as Record<string, string>) || {};
    const now = new Date().toISOString();
    for (const [path, value] of Object.entries(values)) {
      currentParams[path] = value;
      currentMeta[path] = now;
    }
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { parameters: currentParams, parameterMeta: currentMeta },
    });
  }

  /** Chamado pelo cwmp.service.ts ao receber Fault 9005 para paths específicos. */
  async markUnsupported(deviceId: string, paths: string[]): Promise<void> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device?.modelId) return;
    const model = await this.prisma.deviceModel.findUnique({ where: { id: device.modelId } });
    if (!model) return;
    const current = new Set((model.unsupportedParameters as string[]) || []);
    for (const p of paths) current.add(p);
    await this.prisma.deviceModel.update({
      where: { id: model.id },
      data: { unsupportedParameters: Array.from(current) },
    });
    this.logger.warn(`[DECLARE] Modelo ${model.name}: marcando ${paths.length} path(s) como unsupported (Fault 9005)`);
  }

  private async createTask(deviceId: string, tenantId: string, type: string, payload: any) {
    return this.prisma.task.create({
      data: { deviceId, tenantId, type, status: 'PENDING', payload },
    });
  }

  private parentPrefix(path: string): string {
    const idx = path.indexOf('*');
    const trimmed = idx === -1 ? path : path.slice(0, idx);
    return trimmed.replace(/\.$/, '');
  }

  private matchesAny(path: string, patterns: string[]): boolean {
    return patterns.some((p) => path === p || path.startsWith(p.replace(/\*$/, '')));
  }
}
```

`backend/src/discovery-engine/discovery-engine.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { DeclareService } from './declare.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  providers: [DeclareService, PrismaService],
  exports: [DeclareService],
})
export class DiscoveryEngineModule {}
```

> **Integração com o `cwmp.service.ts` (próximo passo, fora deste esqueleto):**
> troque a montagem estática de paths em `handleReadWiFiConfig` por chamadas a `declareService.declare(deviceId, path)` para cada path candidato, e conecte `recordDiscovery` / `recordValues` / `markUnsupported` nos handlers de `GetParameterNamesResponse`, `GetParameterValuesResponse` e `Fault`. Isso elimina o 9005 na raiz.

---

## 4. Serviço compartilhado de manutenção de Tasks — `backend/src/tasks/tasks-maintenance.service.ts`

Usado tanto pelo CLI quanto por um cron (`@nestjs/schedule` já está registrado no seu `app.module.ts`), fechando o item "timeout de tasks travadas" do plano original:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class TasksMaintenanceService {
  private readonly logger = new Logger(TasksMaintenanceService.name);
  private static readonly STUCK_THRESHOLD_MS = 30 * 60_000; // 30 min

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    const result = await this.resetStuckTasks();
    if (result.reset > 0 || result.failed > 0) {
      this.logger.log(`[CRON] tasks resetadas: ${result.reset}, marcadas FAILED: ${result.failed}`);
    }
  }

  async resetStuckTasks(): Promise<{ reset: number; failed: number }> {
    const cutoff = new Date(Date.now() - TasksMaintenanceService.STUCK_THRESHOLD_MS);

    const stuck = await this.prisma.task.findMany({
      where: { status: 'IN_PROGRESS', updatedAt: { lt: cutoff } },
    });

    let reset = 0;
    let failed = 0;

    for (const task of stuck) {
      if (task.attempts + 1 >= task.maxAttempts) {
        await this.prisma.task.update({
          where: { id: task.id },
          data: { status: 'FAILED', attempts: { increment: 1 }, error: 'Timeout: sem resposta do CPE' },
        });
        failed++;
      } else {
        await this.prisma.task.update({
          where: { id: task.id },
          data: { status: 'PENDING', attempts: { increment: 1 } },
        });
        reset++;
      }
    }
    return { reset, failed };
  }

  async pendingByDevice(deviceId?: string) {
    return this.prisma.task.findMany({
      where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, ...(deviceId ? { deviceId } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }
}
```

`backend/src/tasks/tasks.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TasksMaintenanceService } from './tasks-maintenance.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  providers: [TasksMaintenanceService, PrismaService],
  exports: [TasksMaintenanceService],
})
export class TasksModule {}
```

---

## 5. Comandos do CLI

### `backend/src/cli/commands/device-inspect.command.ts`
Substitui todos os `check_*.py` / `check_device_*.py`.

```typescript
import { Command, CommandRunner } from 'nest-commander';
import { PrismaService } from '../../common/prisma.service';

@Command({ name: 'device:inspect', description: 'Mostra status, parâmetros e tasks de um device' })
export class DeviceInspectCommand extends CommandRunner {
  constructor(private prisma: PrismaService) {
    super();
  }

  async run(passedParams: string[]): Promise<void> {
    const [serial] = passedParams;
    if (!serial) {
      console.error('Uso: pnpm cli device:inspect <serial>');
      return;
    }

    const device = await this.prisma.device.findUnique({
      where: { serial },
      include: { model: true, tasks: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });

    if (!device) {
      console.error(`Device com serial "${serial}" não encontrado`);
      return;
    }

    const params = (device.parameters as Record<string, string>) || {};
    const discovered = (device.discoveredPaths as string[]) || [];

    console.log(`\n=== ${device.serial} (${device.manufacturer} ${device.modelName}) ===`);
    console.log(`Status: ${device.status} | Último Inform: ${device.lastInform}`);
    console.log(`Modelo cadastrado: ${device.model?.name ?? '(nenhum)'} | dataModel: ${device.model?.dataModel ?? '-'}`);
    console.log(`Parâmetros em cache: ${Object.keys(params).length} | Paths descobertos: ${discovered.length}`);
    console.log(`\n--- Últimas 10 tasks ---`);
    for (const t of device.tasks) {
      console.log(`[${t.status}] ${t.type} (attempts ${t.attempts}/${t.maxAttempts}) — ${t.createdAt.toISOString()}`);
    }
  }
}
```

### `backend/src/cli/commands/device-refresh.command.ts`
CLI análogo direto ao `declare()` do GenieACS — substitui `trigger_wifi_tplink.py`, `retry_wifi.sh`, `monitor_5ghz.py` etc.

```typescript
import { Command, CommandRunner, Option } from 'nest-commander';
import { PrismaService } from '../../common/prisma.service';
import { DeclareService } from '../../discovery-engine/declare.service';

interface RefreshOptions {
  maxAge?: number;
}

@Command({ name: 'device:refresh', description: 'Equivalente ao declare() do GenieACS: pede um path do CPE de forma segura' })
export class DeviceRefreshCommand extends CommandRunner {
  constructor(
    private prisma: PrismaService,
    private declareService: DeclareService,
  ) {
    super();
  }

  @Option({ flags: '--max-age <ms>', description: 'Idade máxima aceitável em ms antes de re-buscar (default 3600000)' })
  parseMaxAge(val: string): number {
    return parseInt(val, 10);
  }

  async run(passedParams: string[], options: RefreshOptions): Promise<void> {
    const [serial, path] = passedParams;
    if (!serial || !path) {
      console.error('Uso: pnpm cli device:refresh <serial> "<path ou path.*>" [--max-age 3600000]');
      return;
    }

    const device = await this.prisma.device.findUnique({ where: { serial } });
    if (!device) {
      console.error(`Device "${serial}" não encontrado`);
      return;
    }

    const result = await this.declareService.declare(device.id, path, { maxAgeMs: options.maxAge });
    console.log(result);
  }
}
```

### `backend/src/cli/commands/tasks-pending.command.ts`
Substitui `check_all_tasks.sh`, `check_pending_tasks.py`, `check_tasks.sh` etc.

```typescript
import { Command, CommandRunner } from 'nest-commander';
import { TasksMaintenanceService } from '../../tasks/tasks-maintenance.service';

@Command({ name: 'tasks:pending', description: 'Lista tasks PENDING/IN_PROGRESS, opcionalmente por device' })
export class TasksPendingCommand extends CommandRunner {
  constructor(private tasksMaintenance: TasksMaintenanceService) {
    super();
  }

  async run(passedParams: string[]): Promise<void> {
    const [deviceId] = passedParams;
    const tasks = await this.tasksMaintenance.pendingByDevice(deviceId);
    console.table(
      tasks.map((t) => ({ id: t.id, device: t.deviceId, type: t.type, status: t.status, attempts: t.attempts })),
    );
  }
}
```

### `backend/src/cli/commands/tasks-reset-stuck.command.ts`
Substitui `temp_reset_tasks.sh`, `temp_clean.sh` etc. — e é o **mesmo código** usado pelo cron.

```typescript
import { Command, CommandRunner } from 'nest-commander';
import { TasksMaintenanceService } from '../../tasks/tasks-maintenance.service';

@Command({ name: 'tasks:reset-stuck', description: 'Reseta tasks travadas em IN_PROGRESS há mais de 30 min' })
export class TasksResetStuckCommand extends CommandRunner {
  constructor(private tasksMaintenance: TasksMaintenanceService) {
    super();
  }

  async run(): Promise<void> {
    const result = await this.tasksMaintenance.resetStuckTasks();
    console.log(`Resetadas para PENDING: ${result.reset} | Marcadas FAILED: ${result.failed}`);
  }
}
```

---

## 6. Módulo e bootstrap do CLI

`backend/src/cli/cli.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { DiscoveryEngineModule } from '../discovery-engine/discovery-engine.module';
import { TasksModule } from '../tasks/tasks.module';
import { DeviceInspectCommand } from './commands/device-inspect.command';
import { DeviceRefreshCommand } from './commands/device-refresh.command';
import { TasksPendingCommand } from './commands/tasks-pending.command';
import { TasksResetStuckCommand } from './commands/tasks-reset-stuck.command';

@Module({
  imports: [DiscoveryEngineModule, TasksModule],
  providers: [
    PrismaService,
    DeviceInspectCommand,
    DeviceRefreshCommand,
    TasksPendingCommand,
    TasksResetStuckCommand,
  ],
})
export class CliModule {}
```

`backend/src/cli/main-cli.ts`:

```typescript
import { CommandFactory } from 'nest-commander';
import { CliModule } from './cli.module';

async function bootstrap() {
  await CommandFactory.run(CliModule, ['warn', 'error']);
}

bootstrap();
```

---

## 7. Wiring final

**`backend/src/app.module.ts`** — adicione o `TasksModule` (o `DiscoveryEngineModule` só precisa estar disponível onde o `cwmp.service.ts` for consumi-lo, ex: dentro do `AcsModule`):

```diff
+import { TasksModule } from './tasks/tasks.module';
+import { DiscoveryEngineModule } from './discovery-engine/discovery-engine.module';

 @Module({
   imports: [
     ...
+    TasksModule,
+    DiscoveryEngineModule,
   ],
```

**`backend/package.json`** — adicione o script do CLI:

```diff
   "scripts": {
     "dev": "nest start --watch",
+    "cli": "ts-node -r tsconfig-paths/register src/cli/main-cli.ts",
     ...
```

---

## 8. Rodando

```bash
cd backend
pnpm add nest-commander
npx prisma migrate dev --name add_discovery_tracking
npx prisma generate

# Exemplos:
pnpm cli device:inspect ZTE0QJNQ1407460
pnpm cli device:refresh ZTE0QJNQ1407460 "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID"
pnpm cli tasks:pending
pnpm cli tasks:reset-stuck
```

---

## 9. Próximos comandos a adicionar (mesmo padrão, é só copiar um dos acima)

- `device:discover <serial>` — dispara `GetParameterNames` completo (equivalente ao `bootstrap` do GenieACS: `clear("InternetGatewayDevice", now)`).
- `model:unsupported <manufacturer> <name>` — lista os paths marcados como Fault 9005 para um `DeviceModel` (visibilidade do que o motor já aprendeu que aquele CPE não tem).
- `device:connection-request <serial>` — substitui `trigger_cr.sh`.

## 10. Limpeza do repositório

Depois que os comandos acima cobrirem seu fluxo de diagnóstico do dia a dia:

```bash
# na raiz do projeto
rm check_*.py check_*.sh fix_*.py fix_*.sh temp_*.py temp_*.sh temp_*.sql \
   verify_*.py verify_*.sh monitor_*.py trigger_*.py trigger_*.sh \
   discover_*.py explore_*.py test_*.py test_*.sh *.png 2>/dev/null
git add -A
git commit -m "chore: remove scripts de debug ad-hoc, substituídos pelo CLI (pnpm cli)"
```

> Confira antes se algum desses scripts tem lógica única que ainda não foi migrada para um comando — se tiver, vira um novo comando (seção 9) antes de apagar.
