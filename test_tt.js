const { execFile } = require('child_process');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const url = 'https://www.tiktok.com/@khaby.lame';
execFile('curl', ['-sL', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', url], { maxBuffer: 1e8 }, (e, out) => {
    console.log('CURL:', e ? e.message : 'ok', '| user-detail:', String(out || '').includes('webapp.user-detail'));
});
execFile('yt-dlp', ['--flat-playlist', '-J', '--playlist-end', '1', url], { maxBuffer: 1e8, timeout: 40000 }, (e, out) => {
    if (e) return console.log('YTDLP errore:', String(e.message).slice(0, 200));
    const j = JSON.parse(out);
    console.log('YTDLP chiavi:', Object.keys(j).join(','));
    console.log('YTDLP uploader:', j.uploader, '| follower:', j.channel_follower_count);
});
