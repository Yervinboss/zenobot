from curl_cffi import requests
for imp in ['chrome', 'safari', 'chrome131_android', 'firefox']:
    try:
        r = requests.get('https://www.tiktok.com/@khaby.lame', impersonate=imp, headers={'Accept-Language': 'en-US,en;q=0.9'}, timeout=25)
        print(imp, r.status_code, len(r.text), 'user-detail' in r.text)
    except Exception as e:
        print(imp, 'ERR', str(e)[:80])
