# Prompt Deck

Sinematik AI görsel promptları için anahtar kelime konsolu — artık tarayıcı sekmesi değil, **çift tıklayıp açılan gerçek bir masaüstü uygulaması**.

Rust + [Tauri 2](https://tauri.app) ile paketlendi. Arayüz, orijinal Prompt Deck HTML uygulamasının kendisi; Rust katmanı ona bir tarayıcının veremediklerini ekliyor: kendi penceresi, internetsiz çalışan yerel fontlar, native "Farklı kaydet" penceresi, CORS duvarına takılmayan AI asistanı ve **GitHub üzerinden imzalı otomatik güncelleme**.

---

## Arkadaşların için: kurulum

Uygulamayı [**Releases**](https://github.com/miraged47/prompt-deck-V2/releases/latest) sayfasından indirirler.

**macOS** — `.dmg` dosyasını indir, Prompt Deck'i Applications klasörüne sürükle.
Uygulama Apple tarafından imzalanmadığı için ilk açılışta macOS uyarı verir:

> **Uygulamaya sağ tıkla → Aç → yine Aç.** Sadece ilk seferde gerekli.

Uyarı ısrarcıysa Terminal'de:

```bash
xattr -dr com.apple.quarantine "/Applications/Prompt Deck.app"
```

**Windows** — `-setup.exe` dosyasını indir ve çalıştır. SmartScreen "bilinmeyen yayıncı" derse: *Ek bilgi → Yine de çalıştır*. Kurulum yönetici şifresi istemez.

> Uygulama açılışta bir **parola (passphrase)** soruyor. Arkadaşlarına bu parolayı ayrıca iletmen gerekiyor.

---

## Güncellemeler nasıl çalışıyor?

1. Uygulama her açılışta (internet varsa) GitHub Releases'teki `latest.json` dosyasına bakar.
2. Yeni sürüm varsa sağ altta bir kart çıkar: sürüm numarası, notlar ve **Install & restart**.
3. Kullanıcı onaylarsa paket indirilir, **imzası doğrulanır**, kurulur ve uygulama kendini yeniden başlatır.
4. İnternet yoksa hiçbir şey olmaz — uygulama tamamen çevrimdışı çalışır.

Elle kontrol: macOS'ta menüden **Prompt Deck → Check for Updates…**, her platformda üst bardaki **sürüm rozetine** tıklayıp açılan pencerenin altındaki **Check for updates** düğmesi.

İmza doğrulaması şu anlama geliyor: GitHub hesabın ele geçirilse bile, senin özel anahtarınla imzalanmamış bir paket kimsenin bilgisayarına kurulamaz.

---

## Kurulum durumu

Aşağıdakilerin hepsi **tamamlandı** — tekrar yapman gerekmiyor:

- [x] Depo oluşturuldu ve kod yüklendi: `github.com/miraged47/prompt-deck-V2` (public)
- [x] İmza anahtarı GitHub Secrets'a eklendi (`TAURI_SIGNING_PRIVATE_KEY`)
- [x] İlk sürüm yayınlandı: **v1.1.0** — macOS, Windows ve Linux kurulumlarıyla
- [x] Bilgisayarında `gh` (GitHub CLI) kuruldu ve git kimliğin ayarlandı

**Bundan sonra yeni sürüm yayınlamak için tek komut yeterli:**

```bash
./scripts/release.sh 1.2.0 "Ne değiştiğini bir cümleyle yaz"
```

Sürüm numarasını güncelle, commit'le, etiketle ve push'la — hepsini bu komut yapar. İkinci argüman isteğe bağlıdır; yazarsan kullanıcıların güncelleme kartında **o metni** görür. GitHub Actions ~10 dakikada üç platformun kurulumlarını derleyip imzalar ve Releases sayfasında yayınlar. Kullanıcıların uygulamayı bir sonraki açışlarında güncelleme kartını görür.

<details>
<summary>Bu kurulum nasıl yapıldı? (referans — tekrar gerekmez)</summary>

### 1. Depo

```bash
git remote add origin https://github.com/miraged47/prompt-deck-V2.git
git branch -M main
git push -u origin main
```

Depo **public** olmalı — güncelleme dosyalarının kimlik doğrulaması olmadan indirilebilmesi gerekiyor. Kod görünür olur; `LICENSE` telif hakkını saklı tutar ama parola kapısı (gate) herkesin görebileceği bir yerde durur, yani onu bir güvenlik önlemi olarak değil, bir "kapı" olarak düşün.

Depo adını farklı seçersen tek komutla güncelle:

```bash
./scripts/set-repo.sh miraged47 yeni-depo-adi
```

### 2. İmza anahtarını GitHub'a tanıt

Anahtar çifti oluşturuldu ve **bilgisayarında** duruyor:

| Dosya | Ne işe yarar |
|---|---|
| `~/.tauri/prompt-deck.key` | Özel anahtar — **gizli**, asla depoya koyma |
| `~/.tauri/prompt-deck.key.pub` | Açık anahtar — `src-tauri/tauri.conf.json` içine gömüldü |

> **Bu özel anahtarı yedekle.** Kaybedersen mevcut kurulumlara bir daha güncelleme gönderemezsin — herkesin uygulamayı elle yeniden kurması gerekir.

GitHub'da depo → **Settings → Secrets and variables → Actions → New repository secret** ile iki gizli değer ekle:

| Secret adı | Değeri |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | `cat ~/.tauri/prompt-deck.key` çıktısının tamamı |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Boş bırak (anahtar parolasız oluşturuldu) |

### 3. İlk sürümü yayınla

```bash
./scripts/release.sh 1.1.0
```

Bu komut sürüm numarasını iki dosyada günceller, commit'ler, `v1.1.0` etiketini oluşturur ve push'lar. GitHub Actions devreye girer, macOS (Intel + Apple Silicon tek pakette) ve Windows kurulumlarını derler, imzalar ve Releases sayfasında yayınlar. Yaklaşık 10–15 dakika sürer.

Sonraki her sürüm için tek komut: `./scripts/release.sh 1.2.0 "Ne değişti"`

</details>

---

## Geliştirme

Gereken: [Rust](https://rustup.rs) ve Xcode Command Line Tools (macOS) / Visual Studio Build Tools (Windows).

```bash
cargo install tauri-cli --version "^2.0" --locked
```

| Komut | Ne yapar |
|---|---|
| `cargo tauri dev` | Uygulamayı geliştirme modunda açar (sağ tık → Inspect Element ile devtools) |
| `cargo tauri build` | Kurulabilir paketleri üretir (`src-tauri/target/release/bundle/`) |
| `PD_DIAG=1 ./src-tauri/target/release/prompt-deck` | Uygulamayı teşhis günlüğüyle çalıştırır — arayüzün yüklenip yüklenmediğini ve güncelleme adımlarını terminale yazar |

Arayüzü değiştirmek için `ui/index.html` dosyasını düzenlemen yeterli; derleme sırasında uygulamanın içine gömülür.

`ui/index.html` normal bir tarayıcıda da açılabilir — `ui/bridge.js` masaüstü dışında kendini devre dışı bırakır, uygulama eski haliyle çalışmaya devam eder.

---

## Proje yapısı

```
ui/
  index.html            Prompt Deck uygulamasının kendisi (orijinal tek dosya)
  bridge.js             Masaüstü köprüsü: kaydetme, pano, AI, güncelleme arayüzü
  fonts.css, fonts/     Yerelleştirilmiş fontlar — internetsiz de aynı görünüm
src-tauri/
  src/lib.rs            Pencere, menü, AI vekili, dosya kaydetme
  src/updater.rs        Güncelleme kontrolü, indirme, imza doğrulama, kurulum
  tauri.conf.json       Uygulama kimliği, pencere ayarları, güncelleme adresi ve açık anahtar
  icons/                Uygulama ikonları (app-icon.svg'den üretildi)
.github/workflows/
  release.yml           Etiket push'landığında derleyip yayınlayan otomasyon
scripts/
  release.sh            Yeni sürüm yayınla
  set-repo.sh           Güncelleme adresini değiştir
```

---

## Bilinmesi gerekenler

**Veriler nerede?** Presetler, prompt arşivi, favoriler ve API anahtarı uygulamanın kendi yerel deposunda tutulur (macOS'ta `~/Library/WebKit/com.miraccavdur.promptdeck`). Tarayıcı sürümünde biriktirdiğin veriler otomatik taşınmaz — tarayıcıda **Export**, masaüstünde **Import** yaparak aktarabilirsin. Aynı yöntem yedekleme için de geçerli.

**AI asistanı.** İstekler artık Rust katmanı üzerinden gidiyor, bu yüzden tarayıcıdaki CORS sorunu yok. Anahtar her kullanıcının kendi bilgisayarında saklanır; uygulamayı paylaşman kendi anahtarını paylaşmak anlamına gelmez — arkadaşların kendi Anthropic anahtarlarını girer.

**Dışa aktarma.** Export düğmesi artık native "Farklı kaydet" penceresi açar ve dosyanın nereye kaydedildiğini alt tarafta bildirir.

**İmzalama ve notarization.** Uygulama Apple/Microsoft tarafından imzalanmıyor; yukarıdaki ilk açılış uyarıları bu yüzden. İstersen Apple Developer üyeliğiyle (yıllık $99) bu uyarılar tamamen kaldırılabilir — `tauri.conf.json` ve workflow'a sertifika bilgileri eklenerek.

---

Copyright (c) 2026 Mirac Cavdur. Tüm hakları saklıdır — bkz. [LICENSE](LICENSE).
