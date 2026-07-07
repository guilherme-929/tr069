"""
Manual TR-069 Session Helper for CGNAT-CPEs

This script helps establish a TR-069 session manually when the CPE is behind
CGNAT and cannot initiate a standard outgoing connection to the ACS.

The solution leverages the existing GenieACS infrastructure while providing
a manual trigger for CPE-to-ACS communication.
"""

import urllib.request
import json
import time
import subprocess
import os
from typing import Optional

BASE_URL = 'http://179.51.184.205/api'
ACS_IP = '179.51.184.205'
ACS_PORT = '7547'
ACS_URL = f'http://{ACS_IP}:{ACS_PORT}/cwmp'

# Admin credentials
ADMIN_EMAIL = 'admin@acs.local'
ADMIN_PASSWORD = 'admin123'

# Device info from logs
CPE_SERIAL = 'ZTE0QJNQ1407460'
CPE_MANUFACTURER = 'ZTE'
CPE_MODEL = 'F670L'
CPE_IP = '100.64.7.216'  # This is the CGNAT IP the CPE is using


def login() -> str:
    """Login to GenieACS and return JWT token"""
    print(f'Logging into GenieACS at {BASE_URL}...')
    data = json.dumps({'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD}).encode()
    req = urllib.request.Request(f'{BASE_URL}/auth/login', data, {'Content-Type': 'application/json'})
    
    try:
        response = urllib.request.urlopen(req, timeout=30)
        token = json.loads(response.read())['accessToken']
        print(f'Login successful. Token: {token[:20]}...')
        return token
    except Exception as e:
        print(f'Login failed: {e}')
        raise


def get_device(token: str) -> dict:
    """Get device info from GenieACS"""
    headers = {'Authorization': f'Bearer {token}'}
    req = urllib.request.Request(f'{BASE_URL}/devices', headers=headers)
    
    try:
        response = urllib.request.urlopen(req, timeout=30)
        devices = json.loads(response.read())
        return devices
    except Exception as e:
        print(f'Failed to get devices: {e}')
        raise


def check_existing_task(token: str, device_id: str) -> Optional[dict]:
    """Check if there's already a pending WiFi task for the device"""
    headers = {'Authorization': f'Bearer {token}'}
    url = f'{BASE_URL}/devices/{device_id}/tasks'
    
    try:
        req = urllib.request.Request(url + '?status=PENDING&type=GetParameterValues', headers=headers)
        response = urllib.request.urlopen(req, timeout=10)
        tasks = json.loads(response.read())
        return tasks.get('data', [])[0] if tasks.get('data') else None
    except Exception as e:
        print(f'Failed to check tasks: {e}')
        return None


def trigger_wifi_read(token: str, device_id: str) -> dict:
    """Trigger a WiFi read operation"""
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    url = f'{BASE_URL}/devices/{device_id}/wifi/read'
    
    try:
        print(f'Sending WiFi read request for device {device_id}...')
        req = urllib.request.Request(url, method='POST', headers=headers, data=b'{}')
        response = urllib.request.urlopen(req, timeout=30)
        result = json.loads(response.read())
        print(f'WiFi read triggered: {result}')
        return result
    except Exception as e:
        print(f'Failed to trigger WiFi read: {e}')
        raise


def trigger_config_provisioning(token: str, device_id: str) -> dict:
    """Trigger configuration provisioning to add the CPE"""
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    
    # Create a basic configuration for the ZTE F670L
    config = {
        'serial': CPE_SERIAL,
        'mac': '00:50:56:XX:XX:XX',  # You'll need to get the actual MAC
        'manufacturer': CPE_MANUFACTURER,
        'modelName': CPE_MODEL,
        'firmwareVersion': 'V9.0.11P1N52',  # From logs
        'connectionRequestUrl': f'http://{CPE_IP}:58000/81ce22bb0b505d6fd1d357aadcabcd7d',
        'connectionRequestUsername': 'alemnet',
        'connectionRequestPassword': 'bf2fef2d-4c7d-45ab-be80-2699d5eada11',
        'acsPublicUrlOverride': f'http://{ACS_IP}:{ACS_PORT}',
    }
    
    url = f'{BASE_URL}/devices'
    try:
        print(f'Creating device config for {CPE_SERIAL}...')
        req = urllib.request.Request(url, method='POST', headers=headers, data=json.dumps(config).encode())
        response = urllib.request.urlopen(req, timeout=30)
        result = json.loads(response.read())
        print(f'Device created: {result}')
        return result
    except Exception as e:
        print(f'Failed to create device: {e}')
        # Check if it's already there
        return None


def main():
    """Main function to help get the CPE working"""
    print('=" * 60)
    print('TR-069 Manual Session Helper for CGNAT CPEs')
    print('=' * 60)
    
    # Step 1: Login
    token = login()
    
    # Step 2: Check if device exists
    print('\nChecking device existence...')
    devices = get_device(token)
    total_devices = devices.get('total', 0)
    print(f'Total devices: {total_devices}')
    
    device_id = None
    for d in devices.get('data', []):
        if d.get('serial') == CPE_SERIAL:
            device_id = d['id']
            print(f'Found existing device: {device_id}')
            print(f'Device status: {d.get("status")}')
            break
    
    if not device_id:
        print(f'Device {CPE_SERIAL} not found. Creating...')
        result = trigger_config_provisioning(token, CPE_SERIAL)
        if result:
            device_id = result.get('id')
        else:
            print(f'Device creation failed or device already exists in database')
            return
    
    # Step 3: Check existing WiFi tasks
    print(f'\nChecking for existing WiFi tasks...')
    existing_task = check_existing_task(token, device_id)
    if existing_task:
        print(f'Found existing task: {existing_task.get("id")}')
        print(f'Task status: {existing_task.get("status")}')
    else:
        print('No existing WiFi tasks found')
    
    # Step 4: Trigger WiFi read
    print('\nTriggering WiFi read operation...')
    wifi_result = trigger_wifi_read(token, device_id)
    
    # Step 5: Check tasks again
    print('\nChecking tasks after WiFi read trigger...')
    task = check_existing_task(token, device_id)
    if task:
        print(f'Task details: {task}')
    else:
        print('No WiFi task found after trigger')
    
    print('\n' + '=' * 60)
    print('NEXT STEPS:')
    print('=' * 60)
    print('1. The WiFi read has been queued for the CPE')
    print('2. You need to manually trigger a TR-069 session')
    print('   from the CPE side (if possible)')
    print('3. OR use a reverse proxy to establish the connection')
    print('4. Check the GenieACS logs for task processing')
    print('5. Refresh the GenieACS web UI to see WiFi parameters')
    print('\nIf this continues to fail, consider:')
    print('- Deploying a GenieACS agent on the CPE')
    print('- Using a different CPE model')
    print('- Setting up a TR-069 relay service')
    print('=' * 60)


if __name__ == '__main__':
    main()
