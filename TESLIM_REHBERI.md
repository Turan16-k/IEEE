# EmisPass: Teslim Rehberi

> **Son teslim: 25 Ekim 2026 Pazar, 17:00 (Türkiye saati), Devpost.** IEEE sayfasındaki "23:59 UTC" saatine güvenme. Hedef, 24 Ekim akşamı her şeyin gönderilmiş olması.

## Hazır olanlar

| Parça | Durum | Nerede |
|---|---|---|
| Akıllı sözleşmeler (FacilityRegistry, EmissionPassport) | ✅ 19 test geçiyor | `contracts/`, `test/` |
| Yapay zekâ doğrulayıcı (7 kontrol, 2 ML modeli, 3 düğüm) | ✅ 9 test geçiyor | `verifier/emispass/` |
| Uçtan uca demo: 10 pasaport, 1 sahtecilik yakalanıyor, 6/6 saldırı engelleniyor | ✅ | `run-demo.ps1` |
| Web paneli (5 sekme, zincirden canlı okuma) | ✅ | `app/` |
| Mimari ve teknik şartname | ✅ | `docs/ARCHITECTURE.md` |
| Güvenlik ve veri bütünlüğü değerlendirmesi (STRIDE) | ✅ | `docs/SECURITY.md` |
| İklim etki değerlendirmesi (3 senaryolu CO2 projeksiyonu) | ✅ | `docs/IMPACT.md` |
| 2 sayfalık özet | ✅ | `docs/SUMMARY.md` |
| Benimseme ve ölçeklenebilirlik yol haritası | ✅ | `docs/ROADMAP.md` |
| Video senaryosu (3:15) | ✅ | `docs/DEMO_SCRIPT.md` |
| Devpost metni (kopyala-yapıştır) | ✅ | `docs/DEVPOST.md` |

## Senin yapman gerekenler (sırayla)

### 1. Bugün: Devpost'a taslak gönderim ve ağırlık sorusu (15 dk)
1. https://ieee-climatechain-hack.devpost.com adresinde kayıtlı değilsen kaydol. Takımın varsa üyeleri ekle.
2. "Start a submission" ile bir taslak aç. Proje adı **EmisPass**, iz **Carbon Markets & Emissions Transparency**. Metni `docs/DEVPOST.md` dosyasından yapıştır. Video ve bağlantıları sonra ekleyeceksin.
3. Discussion sekmesine şu soruyu yaz (değerlendirme ağırlıkları çelişkili olduğu için):
   > Hi! The IEEE Blockchain Türkiye page lists two different judging weightings (30/30/10/10/10/10 and 70/20/10), while Devpost lists five criteria without weights. Which weighting will the judges use? Thank you!

### 2. GitHub'a yükle (15 dk)
Kodu herkese açık bir depoya koy. Aşağıdaki komutlar bu klasörde çalıştırılır; `research_notes/` ve `reports/` klasörleri `.gitignore` sayesinde yüklenmez.
```powershell
git init
git add .
git commit -m "EmisPass: AI-verified emission passports for CBAM / TR-ETS"
git branch -M main
git remote add origin https://github.com/<kullanici-adin>/emispass.git
git push -u origin main
```
GitHub'da depo sayfasında Settings → Pages → "Deploy from branch" → `main` / `(root)` seç. Birkaç dakika sonra panel `https://<kullanici-adin>.github.io/emispass/app/` adresinde çalışır. Zincire erişemediğinde otomatik olarak "snapshot" moduna geçer ve kayıtlı demo verisini gösterir.

### 3. Herkese açık testnet (isteğe bağlı ama puan kazandırır, 30–45 dk)
Rapordaki öneri doğrulanmış bir testnet sözleşmesi göstermekti; bunu yaparsan "çalışan prototip" iddian çok güçlenir. Adım adım anlatım `docs/DEPLOY.md` dosyasında:
- Yeni bir MetaMask cüzdanı aç ve bir Sepolia faucet'tan yaklaşık 0,05 ETH al.
- `.env.example` dosyasını `.env` olarak kopyala ve anahtarlarını gir.
- `.\run-demo.ps1 -Network sepolia` komutunu çalıştır, ardından `npx hardhat verify ...` ile Etherscan doğrulamasını yap.
- Etherscan bağlantılarını README'ye ve Devpost'a ekle.

### 4. Video (1–2 saat)
- `docs/DEMO_SCRIPT.md` dosyasındaki senaryoyu takip et. Süre **3:00–3:30** olsun; bu aralık hem Devpost'un hem IEEE sayfasının kuralını karşılar.
- Kayıttan önce `npx hardhat node` komutunu bir terminalde, `.\run-demo.ps1 -Serve` komutunu ikinci bir terminalde çalıştır. Panel adresi `http://localhost:8080/app/`.
- Kayıt için OBS Studio (ücretsiz) ya da Windows'ta Win+G ile açılan Xbox Game Bar kullanabilirsin.
- YouTube'a "Liste dışı" (unlisted) olarak yükle ve bağlantıyı Devpost'a ekle.
- Videoda bir kez "tesisler kurgusal, tesis verisi sentetik; Türk sektör kıyas verisi gerçek (Climate TRACE)" de. Dürüstlük jüride güven kazandırır.

### 5. Ek belgeleri ekle (15 dk)
IEEE sayfası şunları istiyor; hepsi `docs/` klasöründe hazır:
- Mimari diyagram: `ARCHITECTURE.md`. Mermaid diyagramları GitHub'da otomatik çizilir; PDF gerekirse ekran görüntüsünü al.
- Güvenlik değerlendirmesi: `SECURITY.md`
- CO2 etki projeksiyonu: `IMPACT.md`
- 2 sayfalık özet: `SUMMARY.md`. PDF gerekirse VS Code'da "Markdown PDF" eklentisiyle ya da tarayıcıdan yazdırarak PDF'e çevir.
- Ölçeklenebilirlik yol haritası: `ROADMAP.md`

Devpost'ta dosya yükleme alanı varsa bunların PDF'lerini ekle. Yoksa GitHub bağlantılarını açıklamaya koy.

### 6. Son kontrol (25 Ekim öğleden önce)
- [ ] Devpost gönderimi "Submitted" durumunda; taslakta kalmamış.
- [ ] Video bağlantısı oturum açmadan açılıyor (gizli pencerede dene).
- [ ] GitHub deposu herkese açık ve README düzgün görünüyor.
- [ ] Panel bağlantısı (GitHub Pages) açılıyor.
- [ ] İz seçimi: Carbon Markets & Emissions Transparency.
- [ ] Gönderim onayının ekran görüntüsünü aldın.

## Jüriye karşı güçlü yanlar
Jürinin çoğu Türk kriptografi ve siber güvenlik akademisyeni. Sunumda ve videoda şunları özellikle vurgula:
1. **Tek doğrulayıcıya güvenilmiyor:** 2-of-3 eşik imza; tekrarlanan imzalar ve kayıtsız anahtarlar sayılmıyor.
2. **6 canlı saldırı, 6 engelleme:** Security sekmesi ve `anchor.js` çıktısı.
3. **Seçici ifşa:** ithalatçı yalnızca kendi sevkiyatını görüyor ve bir kaydı yalnızca bir kez kullanabiliyor.
4. **Açıklanabilir ve hash'lenmiş yapay zekâ:** her bulgu sayılarıyla birlikte veriliyor; model sürümü `modelHash` ile zincirde kayıtlı.
5. **Türkiye bağlamı:** CBAM, İklim Kanunu 7552, TR-ETS pilotu, TÜRKAK doğrulayıcıları ve Antalya'daki COP31.

## Olası jüri soruları ve kısa cevaplar
- **"Neden blokzincir?"** Operatör, doğrulayıcı, ithalatçı ve düzenleyici birbirine güvenmiyor. Ortak, değiştirilemez bir kayıt gerekiyor ve hiçbir taraf veritabanının sahibi olmamalı. Token yok; zincirin işi denetim izi tutmak ve kaydın tek kullanımlık olmasını sağlamak.
- **"Operatör sensörün kendisini kurcalarsa?"** Kriptografi veriyi ancak imzalandıktan sonra korur. Bu yüzden veriyi tesis değil, üçüncü taraf (dağıtım şirketi, tedarikçi) imzalıyor; ayrıca dört bağımsız sinyal çapraz kontrol ediliyor. Kalan risk `SECURITY.md` §4'te açıkça yazılı.
- **"Doğrulayıcılar anlaşırsa?"** Düğümler farklı kurumlara dağıtılıyor (iki akredite kuruluş ve bir kamu denetçisi). Eşik yükseltilebiliyor, düzenleyici pasaportu iptal edebiliyor.
- **"Veriler gerçek mi?"** Türk sektör kıyasları gerçek (Climate TRACE, 87 tesis). Tesisler ve tesis verisi sentetik, çünkü gerçek bir tesisin süreç verisi gizli. Pilot aşamada EPİAŞ, e-Fatura ve Sentinel-5P bağlantıları devreye girecek.
- **"Bu bir doğrulayıcının işini mi alıyor?"** Hayır. Akredite doğrulayıcıya önceden mutabakatı yapılmış bir kanıt paketi veriyor; saha ziyareti riskli tesislere yönlendirilmiş oluyor.

## Demoyu yeniden çalıştırma
```powershell
# Terminal 1
npx hardhat node
# Terminal 2
.\run-demo.ps1 -Serve        # tarayıcıda: http://localhost:8080/app/
```
Testler için `npx hardhat test` ve `cd verifier; ..\.venv\Scripts\python -m pytest -q` komutlarını kullan.
