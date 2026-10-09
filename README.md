
<div align="center">
<img src="https://i.postimg.cc/266mKgQj/lv-0-20260913184208.jpg" alt="ZENO ULTIMATE" width="100%" />

# ⚡ ZENO ULTIMATE

**Bot WhatsApp • Android + iPhone + PC**

</div>

---

## 📱 Android (Termux)

> Scarica **Termux** da [F-Droid](https://f-droid.org/packages/com.termux/)

```bash
pkg update && pkg upgrade -y
pkg install -y git nodejs-lts ffmpeg python
pip install -U yt-dlp

git clone https://github.com/TUO-USERNAME/zeno-ultimate.git
cd zeno-ultimate
npm install
nano config.json
node index.js
```

Scansiona il QR con WhatsApp → Dispositivi collegati → Collega un dispositivo

---

💻 PC

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

Avvio

```bash
git clone https://github.com/TUO-USERNAME/zeno-ultimate.git
cd zeno-ultimate
npm install
nano config.json
node index.js
```

---

📱 iPhone

Apple non permette Node.js su iOS. Serve iSH o un VPS.

iSH (gratis)

Installa iSH Shell dall'App Store e digita:

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

VPS (consigliato)

Affitta un VPS Ubuntu (~4€/mese) e segui la guida PC Linux.

---

<div align="center">

⚡ ZENO ULTIMATE ⚡

</div>
