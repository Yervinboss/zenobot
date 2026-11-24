import sys
from curl_cffi import requests
r = requests.get(f'https://www.tiktok.com/@{sys.argv[1]}', impersonate='chrome', headers={'Accept-Language': 'en-US,en;q=0.9'}, timeout=25)
sys.stdout.write(r.text)
