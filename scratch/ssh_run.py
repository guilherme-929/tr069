import subprocess
import sys

def run_ssh_sql(sql):
    cmd = [
        "ssh",
        "-i", "ssh_key",
        "-o", "StrictHostKeyChecking=no",
        "root@179.51.184.205",
        "docker exec -i tr069-postgres psql -U acs -d tr069_acs"
    ]
    print(f"Executing SQL command...")
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    stdout, stderr = p.communicate(input=sql)
    print(f"Exit code: {p.returncode}")
    print("STDOUT:")
    print(stdout)
    print("STDERR:")
    print(stderr)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        sql = sys.argv[1]
    else:
        sql = 'SELECT type, error FROM "Task" WHERE "deviceId" = \'cmrd6v1nl07rlzyfi90vdjy5q\' AND status = \'FAILED\' LIMIT 3;'
    run_ssh_sql(sql)
