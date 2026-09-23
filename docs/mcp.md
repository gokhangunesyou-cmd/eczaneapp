# Nöbetçi Eczane MCP (Model Context Protocol) Sunucusu

Bu proje, yapay zeka asistarlarının (Claude Desktop, Cursor, Windsurf, VS Code MCP eklentisi, custom AI agent'lar) Türkiye'deki il ve ilçe bazında güncel nöbetçi eczane verisine erişebilmesi ve harita yol tarifi (Google Maps, Apple Maps, Yandex) bağlantılarını sunabilmesi için **Model Context Protocol (MCP)** sunucusu içerir.

---

## 🛠️ Sunulan Tool'lar

1. **`get_duty_pharmacies`**
   - **Açıklama:** İl ve ilçe filtresiyle o günün nöbetçi eczane listesini getirir.
   - **Parametreler:**
     - `city` (metin/sayı): İl adı (örn. `"İstanbul"`, `"Antalya"`, `"Ankara"`) veya plaka kodu (örn. `"34"`, `"07"`, `7`). Varsayılan: `7` (Antalya).
     - `district` (metin): İlçe adı (örn. `"Muratpaşa"`, `"Kadıköy"`) veya TÜİK ilçe kodu (örn. `"2037"`).
     - `limit` (sayı): En fazla kaç eczane getirileceği (1–50, varsayılan `20`).
     - `includeExpired` (boolean): Nöbet süresi bitmiş eczaneleri de dahil et.
   - **Çıktı:** Eczane adı, açık adres, telefon numarası (`tel:` bağlantısı ile), nöbet başlangıç/bitiş saatleri ve **Google Maps / Apple Maps / Yandex Navigasyon yol tarifi linkleri**.

2. **`get_cities`**
   - **Açıklama:** Desteklenen 81 Türkiye ilini, plaka kodlarını ve ilçe sayılarını listeler.

3. **`get_districts`**
   - **Açıklama:** Belirtilen bir ile ait tüm ilçeleri ve o ilçedeki aktif nöbetçi eczane sayısını listeler.

---

## 🚀 Çalıştırma

Komut satırından `stdio` modunda başlatmak için:

```bash
npm run mcp
```

VEYA doğrudan `npx tsx` ile:

```bash
npx tsx src/mcp/index.ts
```

---

## ⚙️ Yapay Zeka Entegrasyon Yapılandırmaları

### 1. Claude Desktop (`claude_desktop_config.json`)

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "nobetci-eczane": {
      "command": "npx",
      "args": ["-y", "tsx", "/Users/gokhangunes/Development/nobetci-eczane/src/mcp/index.ts"],
      "env": {
        "NOBETCI_ECZANE_API_URL": "https://nobetcieczane.becayisler.com"
      }
    }
  }
}
```

---

### 2. Cursor / Windsurf / VS Code MCP Configuration (`mcp.json`)

```json
{
  "mcpServers": {
    "nobetci-eczane": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/Users/gokhangunes/Development/nobetci-eczane",
      "env": {
        "NOBETCI_ECZANE_API_URL": "https://nobetcieczane.becayisler.com"
      }
    }
  }
}
```

---

## 🧪 Örnek Yapay Zeka Komutları (Prompts)

Yapay zekanız entegre edildikten sonra aşağıdaki gibi Türkçe doğal dilde sorular yöneltebilirsiniz:

- _"Bugün Antalya Muratpaşa'da nöbetçi olan eczaneleri ve yol tarifi linklerini ver."_
- _"İstanbul Kadıköy nöbetçi eczanelerini listele, telefon ve konum bağlantılarını ekle."_
- _"İzmir Konak nöbetçi eczanelerini ve yol tarifi linkini getir."_

---

## ⚙️ Ortam Değişkenleri

- `NOBETCI_ECZANE_API_URL`: İstek atılacak API adresi (varsayılan: `https://nobetcieczane.becayisler.com`). Yerel sunucuyu kullanmak isterseniz `http://localhost:8787` belirleyebilirsiniz.
