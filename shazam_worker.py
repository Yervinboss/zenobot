import sys
import json
import asyncio
from shazamio import Shazam

async def recognize_song(file_path):
    shazam = Shazam()
    return await shazam.recognize(file_path)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing file path"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    try:
        result = asyncio.run(recognize_song(file_path))
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
