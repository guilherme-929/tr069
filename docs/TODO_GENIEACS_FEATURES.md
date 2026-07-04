# TODO - Funcionalidades do GenieACS para implementar

Baseado na análise do GenieACS em `http://179.51.184.205:3333` (admin/Alemnet2025)

---

## 1. Virtual Parameters (Alta Prioridade)

### O que é
Scripts que computam valores derivados a partir dos parâmetros brutos do CPE.

### Parâmetros necessários

| Nome | Descrição | Path do GenieACS | Como computar |
|------|-----------|-------------------|---------------|
| vLoginPPPoE | Login PPPoE | `VirtualParameters.vLoginPPPoE` | Extrair de `InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Username` |
| vWAN1_IP | IP da WAN principal | `VirtualParameters.vWAN1_IP` | `InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.ExternalIPAddress` |
| vIP_Voip | IP VoIP | `VirtualParameters.vIP_Voip` | `InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.AssociatedDevice.*.AssociatedDeviceIPAddress` ou path específico |
| vWifi-2G | WiFi 2.4GHz resumo | `VirtualParameters.vWifi-2G` | Concatenar SSID + Channel + Status da `WLANConfiguration.1` |
| vWifi-5G | WiFi 5GHz resumo | `VirtualParameters.vWifi-5G` | Concatenar SSID + Channel + Status da `WLANConfiguration.5` |
| vWAN_ALL | WAN completa | `VirtualParameters.vWAN_ALL` | Informações de todas as WANs |

### Arquivos a modificar

#### Backend
```
backend/src/devices/devices.service.ts
  - Adicionar método getVirtualParameters(deviceId)
  - Ler parameters do device e computar valores derivados

backend/src/devices/devices.controller.ts
  - Adicionar endpoint GET /api/devices/:id/virtual-params
```

#### Script de extração
```typescript
// Extrair de devices.service.ts
async getVirtualParameters(deviceId: string) {
  const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) throw new NotFoundException('Device not found');
  
  const params = (device.parameters as Record<string, string>) || {};
  
  // vLoginPPPoE - PPPoE Username
  const vLoginPPPoE = params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username'] || '';
  
  // vWAN1_IP - IP da WAN
  const vWAN1_IP = params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress'] || '';
  
  // vIP_Voip
  const vIP_Voip = params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.1.AssociatedDeviceIPAddress'] || '';
  
  // vWifi-2G - resumo WiFi 2.4GHz
  const ssid2g = params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'] || '';
  const channel2g = params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Channel'] || '';
  const status2g = params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Status'] || '';
  const vWifi2G = `${ssid2g} | Ch: ${channel2g} | ${status2g}`;
  
  // vWifi-5G - resumo WiFi 5GHz
  const ssid5g = params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID'] || '';
  const channel5g = params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Channel'] || '';
  const status5g = params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Status'] || '';
  const vWifi5G = `${ssid5g} | Ch: ${channel5g} | ${status5g}`;
  
  return {
    vLoginPPPoE,
    vWAN1_IP,
    vIP_Voip,
    vWifi2G,
    vWifi5G,
  };
}
```

---

## 2. WiFi Completo - Todas as Bandas (Alta Prioridade)

### O que falta
O código atual só lê `WLANConfiguration.1`. O GenieACS coleta de todas as instâncias (1-8).

### Parâmetros por instância WLAN

| Path | Descrição |
|------|-----------|
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.SSID` | Nome da rede |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.KeyPassphrase` | Senha |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.Channel` | Canal |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.BandWidth` | Largura de banda |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.Enable` | Ativado/Desativado |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.Status` | Status |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.Standard` | Padrão (b,g,n,a,ac) |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.X_ZTE-COM_OperatingFrequencyBand` | 2.4GHz ou 5GHz |

### Arquivos a modificar

#### backend/src/acs/cwmp.service.ts
```typescript
// Método handleReadWiFiConfig - expandir para todas as bandas
async handleReadWiFiConfig(deviceId: string): Promise<any> {
  const params = (device.parameters as Record<string, string>) || {};
  
  // Paths para TODAS as bandas WiFi
  const wifiPaths: string[] = [];
  
  for (let i = 1; i <= 8; i++) {
    wifiPaths.push(
      `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.SSID`,
      `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.KeyPassphrase`,
      `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.Channel`,
      `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.BandWidth`,
      `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.Enable`,
      `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.Status`,
      `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.Standard`,
      `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.TotalAssociations`,
      `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.X_ZTE-COM_OperatingFrequencyBand`,
    );
  }
  
  // Também paths Device.WiFi.* (TR-181)
  wifiPaths.push(
    'Device.WiFi.SSID.1.SSID',
    'Device.WiFi.AccessPoint.1.Security.KeyPassphrase',
  );
  
  // ... resto do código similar ao atual
}
```

#### frontend/src/pages/Devices.tsx
```tsx
// Aba WiFi - mostrar todas as bandas
// Atual: mostra só WLANConfiguration.1
// Novo: mostrar WLANConfiguration.1 até .8 em cards separados
```

---

## 3. Connected Devices (Alta Prioridade)

### O que é
Mostrar dispositivos conectados ao WiFi com:
- MAC Address
- Nome do dispositivo
- IP
- Signal Strength (RSSI em dBm)
- SNR (Signal-to-Noise Ratio)
- Noise level
- Bandwidth
- TX/RX Rate
- Bytes enviados/recebidos
- Tempo conectado (StayTime)

### Parâmetros por dispositivo conectado

| Path | Descrição |
|------|-----------|
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.AssociatedDevice.{M}.AssociatedDeviceMACAddress` | MAC |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.AssociatedDevice.{M}.X_ZTE-COM_AssociatedDeviceName` | Nome do host |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.AssociatedDevice.{M}.AssociatedDeviceIPAddress` | IP |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.AssociatedDevice.{M}.AssociatedDeviceRssi` | RSSI |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.AssociatedDevice.{M}.X_ZTE-COM_WLAN_SNR` | SNR |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.AssociatedDevice.{M}.X_ZTE-COM_WLAN_Noise` | Noise |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.AssociatedDevice.{M}.AssociatedDeviceBandWidth` | Bandwidth |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.AssociatedDevice.{M}.X_ZTE-COM_TXRate` | TX Rate |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.AssociatedDevice.{M}.X_ZTE-COM_RXRate` | RX Rate |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.AssociatedDevice.{M}.X_ZTE-COM_WLAN_BytesReceived` | Bytes RX |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.AssociatedDevice.{M}.X_ZTE-COM_WLAN_BytesSend` | Bytes TX |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.AssociatedDevice.{M}.X_ZTE-COM_StayTime` | Tempo conectado |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.AssociatedDevice.{M}.X_ZTE-COM_WLAN_Radio` | Banda (2.4/5GHz) |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.AssociatedDevice.{M}.X_ZTE-COM_WLAN_ClientMode` | Modo (11n/ac/etc) |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{N}.AssociatedDevice.{M}.X_ZTE-COM_WLAN_ClientChannelWidth` | Largura canal |

### Arquivos a modificar

#### backend/src/acs/cwmp.service.ts
```typescript
// Método handleDiscover - adicionar AssociatedDevice na descoberta
// Já está parcialmente coberto pelo GetParameterNames recursivo
// Mas precisamos de um endpoint específico para connected devices

async handleGetConnectedDevices(deviceId: string): Promise<any> {
  const params = (device.parameters as Record<string, string>) || {};
  
  const connectedDevices: any[] = [];
  
  // Para cada WLANConfiguration (1-8)
  for (let wlan = 1; wlan <= 8; wlan++) {
    let devIndex = 1;
    while (true) {
      const basePath = `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${wlan}.AssociatedDevice.${devIndex}`;
      const mac = params[`${basePath}.AssociatedDeviceMACAddress`];
      if (!mac) break;
      
      connectedDevices.push({
        wlan,
        mac,
        name: params[`${basePath}.X_ZTE-COM_AssociatedDeviceName`] || '',
        ip: params[`${basePath}.AssociatedDeviceIPAddress`] || '',
        rssi: parseInt(params[`${basePath}.AssociatedDeviceRssi`] || '0'),
        snr: parseInt(params[`${basePath}.X_ZTE-COM_WLAN_SNR`] || '0'),
        noise: parseInt(params[`${basePath}.X_ZTE-COM_WLAN_Noise`] || '0'),
        bandwidth: params[`${basePath}.AssociatedDeviceBandWidth`] || '',
        txRate: parseInt(params[`${basePath}.X_ZTE-COM_TXRate`] || '0'),
        rxRate: parseInt(params[`${basePath}.X_ZTE-COM_RXRate`] || '0'),
        bytesReceived: parseInt(params[`${basePath}.X_ZTE-COM_WLAN_BytesReceived`] || '0'),
        bytesSend: parseInt(params[`${basePath}.X_ZTE-COM_WLAN_BytesSend`] || '0'),
        stayTime: params[`${basePath}.X_ZTE-COM_StayTime`] || '0',
        radio: params[`${basePath}.X_ZTE-COM_WLAN_Radio`] || '',
        clientMode: params[`${basePath}.X_ZTE-COM_WLAN_ClientMode`] || '',
        clientChannelWidth: params[`${basePath}.X_ZTE-COM_WLAN_ClientChannelWidth`] || '',
        signalStrength: parseInt(params[`${basePath}.X_ZTE-COM_SignalStrength`] || '0'),
      });
      devIndex++;
    }
  }
  
  return connectedDevices;
}
```

#### backend/src/acs/acs.controller.ts
```typescript
// Adicionar endpoint
@Get('api/devices/:id/connected-devices')
async getConnectedDevices(@Param('id') id: string) {
  return this.cwmpService.handleGetConnectedDevices(id);
}
```

#### frontend/src/pages/Devices.tsx
```tsx
// Nova aba ou seção: "Connected Devices"
// Mostrar tabela com:
// - MAC, Nome, IP, Banda, Signal (barra), SNR, Noise, TX/RX, Bytes
```

---

## 4. Presets com Tags (Média Prioridade)

### O que é
O GenieACS usa presets com pré-condições para disparar ações automaticamente.

### Presets importantes do GenieACS

| Preset | Pré-condição | Ação |
|--------|-------------|------|
| `reboot` | Tags.reboot ou Tags.REBOOT | Reboot do dispositivo |
| `summon` | Tags.summon ou Tags.SUMMON | Refresh forçado de todos os parâmetros |
| `informeVirtual` | Tags.ignorar IS NULL | Coleta de Virtual Parameters |
| `TrocaOLT` | Tags.OLT IS NOT NULL | Trocar username OLT para "alemnet" |
| `TrocaPadrao` | Tags.troca IS NOT NULL | Desativar NAT25 |
| `FWUPgrade_*` | Modelo + versão específicas | Upgrade de firmware |

### Arquivos a modificar

#### backend/src/devices/devices.service.ts
```typescript
// Já existe suporte a tags no sistema
// Precisa adicionar lógica de "trigger tags" - quando uma tag é adicionada, executar ação

async applyTagToDevice(deviceId: string, tag: string): Promise<any> {
  // Aplicar tag
  const device = await this.prisma.device.update({
    where: { id: deviceId },
    data: { tags: { push: tag } }
  });
  
  // Executar ação baseada na tag
  switch (tag.toLowerCase()) {
    case 'reboot':
      return this.cwmpService.handleReboot(deviceId);
    case 'summon':
      return this.cwmpService.handleDiscover(deviceId);
    // ... outros gatilhos
  }
}
```

#### backend/src/devices/devices.controller.ts
```typescript
// Endpoint para aplicar tag com trigger
@Post(':id/tags/:tag')
async applyTag(@Param('id') id: string, @Param('tag') tag: string) {
  return this.devicesService.applyTagToDevice(id, tag);
}
```

---

## 5. Melhorias no Discovery (Média Prioridade)

### O que melhorar

#### backend/src/acs/cwmp.service.ts
```typescript
// 1. Adicionar timeout para tasks de discovery
// 2. Limitar profundidade da recursão (evitar loops infinitos)
// 3. Cache de estrutura conhecida por modelo

// Modificar handleGetParameterNamesResponse:
private async handleGetParameterNamesResponse(data: any): Promise<string> {
  // ... código atual ...
  
  // ADICIONAR: Limitar recursão (máximo 5 níveis)
  const task = await this.prisma.task.findFirst({
    where: { deviceId: device.id, type: 'GetParameterNames', status: 'IN_PROGRESS' },
  });
  const depth = (task?.payload as any)?.depth || 0;
  if (depth >= 5) {
    // Não explorar mais, apenas buscar valores
    await this.prisma.task.updateMany({
      where: { deviceId: device.id, type: 'GetParameterNames', status: 'IN_PROGRESS' },
      data: { status: 'COMPLETED' },
    });
    return this.buildEmptySoapEnvelope();
  }
  
  // Para cada objeto filho, incrementar depth
  for (const objPath of objectsToExplore) {
    await this.prisma.task.create({
      data: {
        deviceId: device.id,
        type: 'GetParameterNames',
        status: 'PENDING',
        payload: { parameterPath: objPath, nextLevel: true, depth: depth + 1 },
        tenantId: device.tenantId,
      },
    });
  }
}
```

---

## 6. Dashboard com Gráficos (Baixa Prioridade)

### Gráficos que o GenieACS tem

| Gráfico | Fonte |
|---------|-------|
| Online/Offline | `Events.Inform` vs tempo |
| Por Modelo | `DeviceID.ProductClass` |
| Por Tags | `Tags.*` |
| Novos CPEs 24h | `Events.Registered` |
| Por OLT | `InternetGatewayDevice.ManagementServer.Username` |

### Arquivos a modificar

#### frontend/src/pages/Dashboard.tsx
```tsx
// Adicionar gráficos:
// 1. Pie chart: Online vs Offline
// 2. Bar chart: Por modelo
// 3. Bar chart: Por tags
// 4. Line chart: CPEs conectados ao longo do tempo

// Usar lib: recharts ou chart.js
```

#### backend/src/acs/acs.service.ts
```typescript
// Adicionar endpoint para dados dos gráficos
async getChartData(tenantId: string) {
  const devices = await this.prisma.device.findMany({ where: { tenantId } });
  
  const byModel: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byTag: Record<string, number> = {};
  
  for (const d of devices) {
    byModel[d.modelName] = (byModel[d.modelName] || 0) + 1;
    byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    for (const tag of d.tags) {
      byTag[tag] = (byTag[tag] || 0) + 1;
    }
  }
  
  return { byModel, byStatus, byTag, total: devices.length };
}
```

---

## 7. Resumo das Alterações por Arquivo

### Backend (NestJS)

| Arquivo | Alterações |
|---------|-----------|
| `backend/src/devices/devices.service.ts` | Adicionar `getVirtualParameters()`, `getConnectedDevices()`, `applyTagToDevice()` |
| `backend/src/devices/devices.controller.ts` | Adicionar endpoints GET `/virtual-params`, GET `/connected-devices`, POST `/tags/:tag` |
| `backend/src/acs/cwmp.service.ts` | Expandir `handleReadWiFiConfig` para todas bandas, melhorar `handleDiscover` com depth limit, adicionar `handleGetConnectedDevices` |
| `backend/src/acs/acs.controller.ts` | Adicionar endpoint GET `/devices/:id/connected-devices` |
| `backend/src/acs/acs.service.ts` | Adicionar `getChartData()` |

### Frontend (React)

| Arquivo | Alterações |
|---------|-----------|
| `frontend/src/pages/Devices.tsx` | Nova aba "Connected Devices", expandir aba WiFi para todas bandas, mostrar Virtual Parameters |
| `frontend/src/pages/Dashboard.tsx` | Adicionar gráficos (pie, bar, line) |

---

## 8. Parâmetros WiFi por Modelo (Referência)

### ZTE F670L
- `InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.*` (2.4GHz, canal 6)
- `InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.*` (5GHz, canal 124)
- `InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.*` (5GHz adicional)
- `InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.*` (5GHz adicional)
- `InternetGatewayDevice.LANDevice.1.WLANConfiguration.8.*` (5GHz adicional, Status=Up)
- `InternetGatewayDevice.LANDevice.1.WIFI.Radio.1.*` (2.4GHz Radio)
- `InternetGatewayDevice.LANDevice.1.WIFI.Radio.2.*` (5GHz Radio)
- `InternetGatewayDevice.X_ZTE-COM_EasyMesh.*` (Mesh networking)
- `InternetGatewayDevice.X_ZTE-COM_Bandsteering.*` (Band steering)

### Huawei EG8145X6
- `InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.*` (2.4GHz)
- `InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.*` (5GHz)
- `InternetGatewayDevice.LANDevice.1.WLANConfiguration.3.*` (5GHz adicional)
- `InternetGatewayDevice.LANDevice.1.WLANConfiguration.4.*` (5GHz adicional)
- `InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.*` (5GHz)

### MP_X421RQ_F (Stavix)
- `InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.*` (2.4GHz)
- `InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.*` (5GHz)

### UN1200X-AC (UNEE)
- `InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.*` (2.4GHz)
- `InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.*` (5GHz)

### AC10 (Tenda)
- `InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.*` (2.4GHz)
- `InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.*` (5GHz)

---

## 9. Prioridade de Implementação

1. **Semana 1**: Virtual Parameters + WiFi completo
2. **Semana 2**: Connected Devices + Melhorias Discovery
3. **Semana 3**: Tags com triggers
4. **Semana 4**: Dashboard com gráficos
