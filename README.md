

<div align="center">

<img src="https://i.postimg.cc/266mKgQj/lv-0-20260913184208.jpg" alt="ZENO ULTIMATE" width="100%" style="border-radius: 15px;" />

<br><br>

# ⚡ ZENO ULTIMATE

### 🤖 Bot WhatsApp moderno • Android + iPhone + PC

<br>

[![Version](https://img.shields.io/badge/version-4.1.0-blueviolet?style=for-the-badge)](https://github.com)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/baileys-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://www.npmjs.com/package/@itsliaaa/baileys)

</div>

---

## ✨ Cos'è

**ZENO ULTIMATE** è un bot WhatsApp basato su [Baileys](https://www.npmjs.com/package/@itsliaaa/baileys) con **Cards Engine universale** — funziona perfettamente sia su **Android** che su **iPhone**.

**Features principali:**
- 🃏 **Card universali** con fallback automatico (Android/iPhone)
- 🎨 **4 temi UI**: `zeno`, `neon`, `soft`, `minimal`
- 🛡️ **Anti-spam**, anti-flood, ban utenti/gruppi, whitelist
- 🔌 **Sistema plugin** modulare con hot-reload
- 🎵 Playlist · 🎮 Giochi · 💰 RPG · 📥 Download

---

## 📦 Requisiti

- **Node.js** ≥ 18 ([scarica](https://nodejs.org))
- **FFmpeg** (per audio/video/sticker)
- **yt-dlp** (per download YouTube)
- **Git** (per clonare)
- Numero WhatsApp attivo

---

## 📱 Installazione su Android (Termux)

> Scarica **Termux** da [F-Droid](https://f-droid.org/packages/com.termux/) (non dal Play Store)

```bash
# 1. Aggiorna
pkg update && pkg upgrade -y

# 2. Installa pacchetti
pkg install -y git nodejs-lts ffmpeg python
pip install -U yt-dlp

# 3. Clona
cd ~
git clone https://github.com/TUO-USERNAME/zeno-ultimate.git
cd zeno-ultimate

# 4. Installa dipendenze
npm install

# 5. Configura (metti il tuo numero senza +)
nano config.json

# 6. Avvia
node index.js
```

Login: scansiona il QR con WhatsApp → Dispositivi collegati → Collega un dispositivo

Tieni attivo:

```bash
pkg install -y termux-api
termux-wake-lock
```

---

💻 Installazione su PC

Windows

1. Installa Node.js LTS
2. Installa Git
3. Installa FFmpeg (aggiungi al PATH)
4. pip install yt-dlp

Linux

```bash
sudo apt update
sudo apt install -y git nodejs npm ffmpeg python3-pip
pip3 install yt-dlp
```

macOS

```bash
brew install node git ffmpeg
pip3 install yt-dlp
```

Avvio (tutte le piattaforme)

```bash
git clone https://github.com/TUO-USERNAME/zeno-ultimate.git
cd zeno-ultimate
npm install
nano config.json      # imposta il tuo numero
node index.js
```

Login: scansiona il QR con WhatsApp.

Tieni attivo (Linux/Mac):

```bash
npm i -g pm2
pm2 start index.js --name zeno
pm2 save
```

---

📱 Installazione su iPhone

Apple non permette Node.js direttamente su iOS. Serve iSH o un VPS.

Metodo 1 — iSH (gratis)

1. Installa iSH Shell dall'App Store
2. Apri iSH e digita:

```sh
apk update && apk upgrade
apk add nodejs npm git python3 py3-pip ffmpeg make gcc musl-dev
pip3 install -U yt-dlp

cd ~
git clone https://github.com/TUO-USERNAME/zeno-ultimate.git
cd zeno-ultimate
npm install
nano config.json
node index.js
```

Metodo 2 — VPS (consigliato) ⭐

Affitta un VPS (Hetzner, Contabo, DigitalOcean ~4€/mese), installa Ubuntu e segui la guida PC Linux.

Vantaggi: bot sempre online 24/7, zero consumo batteria.

---

⚙️ Configurazione rapida

```json
{
    "numero": "393331234567",
    "prefix": ".",
    "botName": "ZENO ULTIMATE",
    "theme": "zeno",
    "cardMode": "auto",
    "pairing": false
}
```

Opzione Descrizione
numero Il tuo numero WhatsApp (senza +)
prefix Prefisso comandi (default .)
theme zeno · neon · soft · minimal
cardMode auto · carousel · album · stack · buttons · text
pairing true = codice invece del QR

---

📋 Comandi base

Comando Descrizione
.menu Menu principale
.ping Latenza e uptime
.status Stato del bot
.theme <nome> Cambia tema
.cardmode <modo> Cambia modalità card
.plugins Lista plugin caricati
.reload Ricarica plugin

ℹ️ Altri comandi dipendono dai plugin installati in ./plugins/

---

🛠️ Creare un plugin

Crea ./plugins/ciao.js:

```javascript
module.exports = {
    commands: ['ciao'],
    category: 'fun',
    description: 'Saluta l\'utente',

    async run(sock, m, args, cmd, ctx) {
        await ctx.reply(`👋 Ciao *${ctx.pushName}*!`)
    }
}
```

Il bot lo carica automaticamente grazie all'hot-reload. ♻️

---

📜 Licenza

MIT — libero di modificare e distribuire.

---

<div align="center">

<img src="https://i.postimg.cc/266mKgQj/lv-0-20260913184208.jpg" width="150" style="border-radius: 12px;" />

<br>

⚡ ZENO ULTIMATE BOT ⚡

<sub>Made with 💜 in Italy 🇮🇹</sub>

</div>
```

FINE — copia fino a qui 

---

⚠️ Nota importante

Quando lo incolli su GitHub, sostituisci TUO-USERNAME con il tuo username GitHub reale (compare 2 volte):

· Nel comando git clone di Android
· Nel comando git clone di PC

Se vuoi lo puoi cambiare anche dopo, direttamente su GitHub cliccando sulla matita ✏️ del README.

---
