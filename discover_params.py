"""
Script para descobrir todos os parâmetros TR-069 de um dispositivo (roteador/CPE)
e identificar especificamente parâmetros WiFi.

Uso:
  python discover_params.py <device_id>
  python discover_params.py <device_id> --watch   # Monitora o progresso do scan
  python discover_params.py <device_id> --wifi    # Mostra apenas parâmetros WiFi
  python discover_params.py --list                # Lista dispositivos disponíveis

Pré-requisitos:
  pip install requests
"""
import sys
import json
import time
import argparse
from typing import Optional
import urllib.request, urllib.error

API_BASE = 'http://177.93.157.113/api'
EMAIL = 'admin@acs.local'
PASSWORD = 'admin123'


def login() -> str:
    data = json.dumps({'email': EMAIL, 'password': PASSWORD}).encode()
    req = urllib.request.Request(f'{API_BASE}/auth/login', data,
                                 {'Content-Type': 'application/json'})
    r = urllib.request.urlopen(req)
    return json.loads(r.read())['accessToken']


def api_get(token: str, path: str) -> dict:
    req = urllib.request.Request(f'{API_BASE}{path}',
                                 headers={'Authorization': f'Bearer {token}'})
    r = urllib.request.urlopen(req)
    return json.loads(r.read())


def api_post(token: str, path: str, body: dict = None) -> dict:
    data = json.dumps(body or {}).encode()
    req = urllib.request.Request(f'{API_BASE}{path}', data,
                                 {'Content-Type': 'application/json',
                                  'Authorization': f'Bearer {token}'})
    r = urllib.request.urlopen(req)
    return json.loads(r.read())


def list_devices(token: str):
    data = api_get(token, '/devices')
    print(f"{'ID':<30} {'Serial':<20} {'Model':<25} {'Status':<15} {'IP'}")
    print('-' * 110)
    for d in data.get('data', []):
        print(f"{d['id']:<30} {d['serial']:<20} {d['modelName']:<25} {d['status']:<15} {d.get('ipAddress', '-')}")


def start_discovery(token: str, device_id: str):
    print(f'Iniciando descoberta de parâmetros para device {device_id}...')
    result = api_post(token, f'/devices/{device_id}/discover')
    print(f"Task criada: {result['task']['id']}")
    print(f"Mensagem: {result['message']}")
    print()
    print("A descoberta será processada quando o CPE conectar novamente.")
    print("Use a flag --watch para monitorar o progresso.")
    return result


def watch_discovery(token: str, device_id: str, poll_interval: int = 5):
    print(f'Monitorando descoberta de parâmetros para device {device_id}...')
    print('Aguardando o CPE conectar e processar as tasks...')
    print()

    last_progress = -1
    while True:
        try:
            status = api_get(token, f'/devices/{device_id}/discover/status')
            progress = status.get('progress', 0)
            state = status.get('status', 'idle')

            if progress != last_progress:
                print(f"[{state.upper()}] {status.get('fetched', 0)}/{status.get('leaves', 0)} parâmetros ({progress}%) | "
                      f"{status.get('objects', 0)} objetos | {status.get('pendingTasks', 0)} tasks pendentes")
                last_progress = progress

            if state == 'complete':
                print()
                print('=' * 60)
                print('DESCOBERTA COMPLETA!')
                print(f'Total de objetos: {status.get("objects", 0)}')
                print(f'Total de parâmetros: {status.get("leaves", 0)}')
                print(f'Parâmetros com valor: {status.get("fetched", 0)}')
                print()

                # Mostrar parâmetros WiFi encontrados
                wifi = status.get('wifiParams', {})
                if wifi:
                    print(f'--- PARÂMETROS WiFi ENCONTRADOS ({len(wifi)}) ---')
                    for k, v in sorted(wifi.items()):
                        writable = 'RW' if status.get('writable', {}).get(k) else 'RO'
                        print(f'  [{writable}] {k} = {v}')
                else:
                    print('Nenhum parâmetro WiFi encontrado.')

                print()
                print(f'Todos os parâmetros estão disponíveis em parameters.__discovered__._values')
                return status

            if state == 'idle' and progress == 0:
                print('Aguardando conexão do CPE...')

            time.sleep(poll_interval)

        except KeyboardInterrupt:
            print()
            print('Monitoramento interrompido pelo usuário.')
            return None
        except urllib.error.HTTPError as e:
            print(f'Erro HTTP: {e.code} - {e.read().decode()[:200]}')
            time.sleep(poll_interval)
        except Exception as e:
            print(f'Erro: {e}')
            time.sleep(poll_interval)


def show_wifi_params(token: str, device_id: str):
    status = api_get(token, f'/devices/{device_id}/discover/status')
    wifi = status.get('wifiParams', {})
    writable = status.get('writable', {})

    print(f'Status: {status.get("status", "unknown").upper()}')
    print(f'Progresso: {status.get("fetched", 0)}/{status.get("leaves", 0)} parâmetros ({status.get("progress", 0)}%)')
    print()

    if wifi:
        print(f'--- PARÂMETROS WiFi ({len(wifi)}) ---')
        print(f'{"WR":<5} {"Parâmetro":<70} {"Valor"}')
        print('-' * 100)
        for k, v in sorted(wifi.items()):
            w = 'RW' if writable.get(k) else 'RO'
            print(f'  {w:<3} {k:<70} {v}')
    else:
        print('Nenhum parâmetro WiFi encontrado.')
        print()
        print('Dica: Inicie a descoberta primeiro com:')
        print(f'  python discover_params.py {device_id} --watch')


def main():
    parser = argparse.ArgumentParser(
        description='Descobre todos os parâmetros TR-069 de um dispositivo CPE/roteador')
    parser.add_argument('device_id', nargs='?', help='ID do dispositivo')
    parser.add_argument('--list', action='store_true', help='Listar dispositivos disponíveis')
    parser.add_argument('--watch', action='store_true', help='Monitorar progresso da descoberta')
    parser.add_argument('--wifi', action='store_true', help='Mostrar apenas parâmetros WiFi')
    parser.add_argument('--poll', type=int, default=5, help='Intervalo de polling em segundos (default: 5)')

    args = parser.parse_args()

    try:
        token = login()
    except Exception as e:
        print(f'Erro de autenticação: {e}')
        print('Verifique as credenciais em EMAIL/PASSWORD no script.')
        sys.exit(1)

    if args.list or not args.device_id:
        list_devices(token)
        return

    device_id = args.device_id

    if args.wifi:
        show_wifi_params(token, device_id)
    elif args.watch:
        start_discovery(token, device_id)
        watch_discovery(token, device_id, args.poll)
    else:
        start_discovery(token, device_id)


if __name__ == '__main__':
    main()
