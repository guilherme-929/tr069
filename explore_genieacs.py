"""
Explora o GenieACS para extrair dados e configurações que podem ser
trazidos para o sistema TR-069 customizado.

Uso: python explore_genieacs.py
"""
import json
import urllib.request, urllib.error
import ssl

GENIEACS_URL = 'http://179.51.184.205:7557'
GENIEACS_UI = 'http://179.51.184.205:3333'
USERNAME = 'admin'
PASSWORD = 'Alemnet2025'

ctx = ssl._create_unverified_context()


def nbi_get(path: str) -> dict:
    """Faz GET na NBI API do GenieACS sem autenticação (NBI é aberta por default)"""
    url = f'{GENIEACS_URL}{path}'
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f'  HTTP {e.code}: {e.read().decode()[:200]}')
        return {}
    except Exception as e:
        print(f'  Erro: {e}')
        return {}


def nbi_get_with_auth(path: str, username=USERNAME, password=PASSWORD):
    """Faz GET na NBI com autenticação Basic"""
    url = f'{GENIEACS_URL}{path}'
    try:
        auth = f'{username}:{password}'
        encoded = urllib.request.base64.b64encode(auth.encode()).decode()
        req = urllib.request.Request(url, headers={'Authorization': f'Basic {encoded}'})
        with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f'  HTTP {e.code}: {e.read().decode()[:200]}')
        return {}
    except Exception as e:
        print(f'  Erro: {e}')
        return {}


def main():
    print('=' * 70)
    print('EXPLORAÇÃO DO GENIEACS')
    print(f'URL: {GENIEACS_URL} (NBI API)')
    print(f'UI: {GENIEACS_UI}')
    print('=' * 70)
    print()

    # 1. Tenta acessar a NBI API (porta 7557)
    print('[1] Testando conexão com NBI API...')
    devices = nbi_get('/devices/?query=%7B%7D&limit=3')
    if devices:
        print(f'  CONECTADO! NBI API respondendo.')
        print(f'  Total de devices (amostra): {len(devices)}')
        for d in devices[:3]:
            print(f'    - {d.get("_id", "?")[:60]}')
    else:
        print('  NBI API sem resposta - tentando com autenticação...')
        devices = nbi_get_with_auth('/devices/?query=%7B%7D&limit=3')
        if devices:
            print(f'  CONECTADO com auth! Total devices (amostra): {len(devices)}')
            for d in devices[:3]:
                print(f'    - {d.get("_id", "?")[:60]}')
        else:
            print('  NBI API não acessível.')
    print()

    # 2. Lista presets
    print('[2] Presets configurados...')
    presets = nbi_get('/presets/')
    if presets:
        print(f'  Total presets: {len(presets)}')
        for p in presets:
            name = p.get('_id', '?')
            precond = p.get('precondition', 'none')
            print(f'    - {name}')
            print(f'      Precondition: {str(precond)[:100]}')
            if 'configurations' in p:
                for c in p.get('configurations', [])[:3]:
                    print(f'      Config: {c.get("name", c.get("type", "?"))}')
    else:
        print('  Nenhum preset encontrado ou API não respondeu.')
    print()

    # 3. Lista provisions (scripts)
    print('[3] Provisions (scripts)...')
    provisions = nbi_get('/provisions/')
    if provisions:
        print(f'  Total provisions: {len(provisions)}')
        for p in provisions:
            print(f'    - {p.get("_id", "?")}')
    else:
        print('  Nenhum provision encontrado.')
    print()

    # 4. Busca devices com parâmetros WiFi
    print('[4] Buscando parâmetros WiFi nos devices...')
    if devices and len(devices) > 0:
        first_id = devices[0].get('_id', '')
        if first_id:
            dev_detail = nbi_get(f'/devices/?query={json.dumps({"_id": first_id})}')
            if dev_detail and len(dev_detail) > 0:
                wifi_params = {}
                for k, v in dev_detail[0].items():
                    kl = k.lower()
                    if any(x in kl for x in ['wifi', 'wlan', 'ssid', 'passphrase', 'preshared']):
                        wifi_params[k] = v
                if wifi_params:
                    print(f'  Device: {first_id}')
                    for k, v in wifi_params.items():
                        print(f'    {k} = {v}')
                else:
                    print(f'  Device {first_id}: Nenhum parâmetro WiFi encontrado nos primeiros 500 chars')
                    # Mostra uma amostra dos parâmetros
                    keys = list(dev_detail[0].keys())[:20]
                    print(f'  Amostra de parâmetros do device:')
                    for k in keys:
                        print(f'    {k}: {str(dev_detail[0][k])[:80]}')
    print()

    # 5. Informações do sistema
    print('[5] Configuração extraída do clientConfig da UI:')
    print('''
  --- FILTROS ---
  - Serial number (DeviceID.SerialNumber)
  - MODELO (DeviceID.ProductClass)
  - Tag
  - Login (VirtualParameters.vLoginPPPoE)

  --- PARÂMETROS PRINCIPAIS RASTREADOS ---
  - Fabricante, Modelo, Hardware/Software Version
  - WAN IP: InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.ExternalIPAddress
  - WiFi 2.4GHz SSID: InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID
  - WiFi 2.4GHz Senha: InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase
  - WiFi 5GHz SSID: InternetGatewayDevice.LANDevice.5.WLANConfiguration.5.SSID
  - WiFi 5GHz Senha: InternetGatewayDevice.LANDevice.5.WLANConfiguration.5.KeyPassphrase
  - Dispositivos Conectados 2.4GHz (com sinal, banda, ruído)
  - Dispositivos Conectados 5GHz (com sinal, banda, ruído)
  - LAN Hosts (nome, IP, MAC)

  --- VIRTUAL PARAMETERS (scripts customizados) ---
  - vLoginPPPoE, vWAN1_IP, vIP_Voip, vWifi-2G, vWifi-5G

  --- TAGS USADAS ---
  - colaboradores, internos, olt, pop, url, dns, nat25, teste, tomany

  --- MODELOS DE CPE ---
  - MP_X421RQ_F / MP_X421R (MPX Stavix)
  - MP_G421R / MP_G421RQ (MPG Stavix)
  - UN1200X-AC (UNI1200 - UNEE)
  - EG8145V5-V2, EG8141A5, HG8546M, HG8546M5 (Huawei)
  - AC10 (Roteador 5G)
  - EG8145X6 (Huawei WiFi6)
  - HS8145V, G-140W-C, HG9, HS8546V5, EG8145V5, HS8545M5
  - F670L (ZTE), DM986-414
  ''')

    # 6. Tenta pegar estatísticas via UI API
    print('[6] Tentando API da UI (porta 3333)...')
    try:
        # Tenta login na UI
        login_data = json.dumps({"username": USERNAME, "password": PASSWORD}).encode()
        req = urllib.request.Request(
            f'{GENIEACS_UI}/api/login',
            login_data,
            {'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=10, context=ctx) as r:
            result = json.loads(r.read())
            print(f'  Login UI: OK - {json.dumps(result)[:200]}')

        # Tenta pegar devices da UI API
        if 'token' in result:
            token = result['token']
            # Tenta /api/devices
            req2 = urllib.request.Request(
                f'{GENIEACS_UI}/api/devices?limit=5',
                headers={'Authorization': f'Bearer {token}'}
            )
            with urllib.request.urlopen(req2, timeout=10, context=ctx) as r2:
                devs = json.loads(r2.read())
                print(f'  Devices via UI: {len(devs)} devices retornados')
                if devs and len(devs) > 0:
                    for d in devs[:5]:
                        print(f'    ID: {d.get("_id", "?")[:50]}')
                        # Mostra alguns campos
                        for campo in ['DeviceID.SerialNumber', 'DeviceID.ProductClass',
                                      'InternetGatewayDevice.DeviceInfo.SoftwareVersion',
                                      'InternetGatewayDevice.DeviceInfo.HardwareVersion',
                                      'VirtualParameters.vLoginPPPoE',
                                      'VirtualParameters.vWifi-2G',
                                      'VirtualParameters.vWifi-5G']:
                            if campo in d:
                                print(f'      {campo}: {d[campo]}')
    except urllib.error.HTTPError as e:
        print(f'  HTTP {e.code}: {e.read().decode()[:200]}')
    except Exception as e:
        print(f'  Erro: {e}')

    print()
    print('=' * 70)
    print('RESUMO DO QUE PODE SER TRAZIDO PARA O SISTEMA')
    print('=' * 70)
    print('''
  1. VIRTUAL PARAMETERS (scripts de parametrização):
     - Criar módulo de "Virtual Parameters" no backend para executar
       scripts JavaScript/NestJS que computam valores derivados
     - vLoginPPPoE, vWAN1_IP, vIP_Voip, vWifi-2G, vWifi-5G

  2. WiFi COMPLETO (2.4GHz + 5GHz):
     - SSID, KeyPassphrase para ambas bandas
     - Dispositivos conectados com sinal (SignalStrength), ruído, banda
     - Canais, frequência, status da interface

  3. TAGS:
     - Já existe suporte a tags no sistema atual, só expandir

  4. FILTROS AVANÇADOS:
     - Filtros na listagem de devices por parâmetros customizados

  5. PRESETS/PROVISIONS:
     - GenieACS usa presets com pré-condições e provisions JS
     - Equivalente ao sistema de provisionamento já existente

  6. DASHBOARD COM GRÁFICOS:
     - Online/Offline, por modelo, por tags, por OLT
     - Novos CPEs nas últimas 24h

  7. PARÂMETROS AVANÇADOS POR MODELO:
     - ZTE tem X_ZTE-COM_SignalStrength, X_ZTE-COM_WLAN_Radio
     - Huawei tem outros paths específicos
    ''')


if __name__ == '__main__':
    main()
