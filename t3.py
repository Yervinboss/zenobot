import re, json
from curl_cffi import requests
r = requests.get('https://www.tiktok.com/@khaby.lame', impersonate='chrome', headers={'Accept-Language': 'en-US,en;q=0.9'}, timeout=25)
t = r.text
print('titolo:', re.findall(r'<title>(.*?)</title>', t)[:1])
print('script id:', re.findall(r'<script id="([^"]+)"', t))
for k in ['followerCount', 'uniqueId', 'captcha', 'verify', 'SIGI_STATE', 'login']:
    print(k, k in t)
m = re.search(r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', t, re.S)
if m:
    s = json.loads(m.group(1))['__DEFAULT_SCOPE__']
    print('scope:', list(s.keys()))
    print('app-context:', json.dumps(s.get('webapp.app-context', {}))[:300])
