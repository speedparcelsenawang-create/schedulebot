# ScheduleBot

Bot WhatsApp untuk menjadwalkan pengiriman pesan melalui web dashboard.

## Fitur

- Koneksi WhatsApp Web dengan QR code
- Buat schedule pesan untuk chat personal dan group dari dashboard
- Auto-list group WhatsApp di dashboard untuk isi ID group otomatis
- Scheduler otomatis cek pesan jatuh tempo setiap 5 detik
- Daftar schedule dengan status: `pending`, `sent`, `failed`
- Hapus schedule dari dashboard

## Tech Stack

- Node.js + Express
- whatsapp-web.js
- EJS (server-side rendering)
- In-memory store (tanpa database)

## Cara Menjalankan

1. Install dependency:

	```bash
	npm install
	```

2. Buat file environment:

	```bash
	cp .env.example .env
	```

	Set timezone sesuai lokasi anda dalam file `.env`.
	Contoh Malaysia:

	```env
	TZ=Asia/Kuala_Lumpur
	```

	Untuk nombor personal, anda boleh set `DEFAULT_DIAL_CODE=60` supaya nombor lokal seperti `017xxxxxxx` akan ditukar automatik kepada format antarabangsa.

3. Jalankan mode development:

	```bash
	npm run dev
	```

	atau mode production:

	```bash
	npm start
	```

4. Buka dashboard di:

	```
	http://localhost:3000
	```

5. Scan QR code di dashboard menggunakan WhatsApp pada ponsel Anda.

## Format Data

- Tipe tujuan:
	- `group`: id group WhatsApp, contoh `1203630xxxx@g.us` (atau tanpa suffix `@g.us`)
- Waktu kirim: isi lewat input `datetime-local` pada form dashboard

## Catatan

- Data schedule saat ini disimpan di memori (akan hilang jika server restart).
- Session WhatsApp disimpan lokal di folder `.baileys_auth`.

## Deploy ke Railway

Project ini sudah disediakan konfigurasi Railway dalam file `railway.json`.

1. Push repository ke GitHub.
2. Di Railway, pilih `New Project` -> `Deploy from GitHub Repo`.
3. Pilih repository ini.
4. Set environment variables berikut di Railway:

	- `TZ=Asia/Kuala_Lumpur`
	- `DEFAULT_DIAL_CODE=60`
	- `NIXPACKS_NODE_VERSION=20` (fallback jika Railway masih detect Node 18)

	`PORT` tidak perlu diset manual kerana Railway akan inject otomatis.

5. Deploy.

Healthcheck endpoint tersedia di `GET /healthz`.