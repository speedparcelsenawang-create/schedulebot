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
	- `personal`: nomor internasional tanpa simbol, contoh `6281234567890`
	- `group`: id group WhatsApp, contoh `1203630xxxx@g.us` (atau tanpa suffix `@g.us`)
- Waktu kirim: isi lewat input `datetime-local` pada form dashboard

## Catatan

- Data schedule saat ini disimpan di memori (akan hilang jika server restart).
- Session WhatsApp disimpan lokal di folder `.wwebjs_auth`.