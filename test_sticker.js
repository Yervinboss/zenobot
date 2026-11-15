(async () => {
  const kw = process.argv[2] || 'naruto';
  const sorts = ['RECOMMENDED', 'POPULAR', 'RECENT', 'TRENDING', 'HOT', 'MOST_VIEWED'];
  for (const sb of sorts) {
    const res = await fetch('https://api.sticker.ly/v4/stickerPack/smartSearch', {
      method: 'POST',
      headers: {
        'user-agent': 'androidapp.stickerly/3.17.0 (Redmi Note 4; U; Android 29; in-ID; id;)',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        keyword: kw,
        enabledKeywordSearch: true,
        filter: {
          extendSearchResult: false, onlyAnimated: false, onlyStatic: false,
          stickerType: 'ALL', searchBy: 'ALL', languages: ['en'],
          sortBy: sb, minStickerCount: 1
        }
      })
    });
    const j = await res.json();
    const p = j?.result?.stickerPacks?.[0];
    if (!p) {
      console.log(sb, '->', (j?.error?.internalErrorMessage || j?.error?.errorMessage || JSON.stringify(j)).slice(0, 90));
      continue;
    }
    console.log('OK con sortBy', sb);
    console.log(Object.keys(p).join(','));
    console.log(p.name, '|', p.authorName, '|', p.resourceUrlPrefix, '|', JSON.stringify((p.resourceFiles || []).slice(0, 3)), '| totale', (p.resourceFiles || []).length);
    return;
  }
})();
