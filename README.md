# Muntlig

Muntlig lar elever øve på muntlig fagprat med en KI-lærer som snakker norsk, som tale, avatar på skjermen eller tekst. Samtalen bygger på fagstoff og kompetansemål som læreren har publisert. Etterpå får eleven en gjennomgang med egne sitater knyttet til målene og kildene. Det gis ingen karakter.

Bygget under Oslo Sprint, 7.–8. november 2026.

## Kort fortalt

- **Demo:** <https://muntlig-web-production.up.railway.app>. Krever innlogging; kontoer opprettes administrativt, så be teamet om en demokonto.
- **Lærer:** lager en fagpakke med kildeutdrag og kompetansemål, og publiserer den.
- **Elev:** velger fagpakke og trykker «Start fagpraten». Tale går gjennom ElevenLabs Agents; avataren er Simli. KI-læreren følger elevens valgte mål og holder seg til kildene.
- **Gjennomgang:** lages i bakgrunnen når økten avsluttes. Elevens egne svar knyttes til mål og kilde, og hjelp fra KI-læreren merkes som støtte.
- **Arbeidsrom og Mine økter:** aktivitet, snakketid og undersøkte mål fra lagrede økter.
- **Teknologi:** Next.js, React, TypeScript, Supabase med RLS, OpenAI (tekstøkter og målforslag), ElevenLabs, Simli og Railway (Docker). Tekstmodus er av i demoen fordi den mangler OpenAI-nøkkel.
- **Personvern:** ingen rålyd eller video lagres. Leverandørnøkler holdes på serveren, og demoen bruker bare syntetiske testdata. Når tekstmodus er på, sendes elevens tekstsvar til OpenAI.

Resten av dokumentet er arbeidsloggen fra utviklingen: krav, arkitektur, kontroller og avgrensninger.

## Arbeidskontrakt

Første leveranse er leverandørintegrert MVP. Den er ikke en skoleklar produksjonslansering. Ingen karakterer, ingen falsk eksamensprosent, ingen forhåndsskrevne KI-svar.

Tre avtalte testseams: kontrollert publisering, kildeversjonslåst økt og elevsvarforankret evidens. Testdata skal være syntetiske. Ingen rålyd/video lagres.

Arkitektur før bygging: ny kodebase, ingen eksisterende moduler å refaktorere. Én øktmodul eier overgangene, kildevalidering og gjennomgangen. Supabase-klienten bruker brukerens verifiserte identitet og RLS; ingen service-role i appen. En separat, privat skrivenøkkel sperrer direkte klientendringer av øktdata. Leverandører ligger bak serverruter; UI kjenner aldri permanente nøkler. Ingen generisk repository eller agentrammeverk.

`src/app/globals.css` inneholder tokens og grunnstiler. `src/app/styles/` deler resten etter produktflate. Importrekkefølgen er eksplisitt i rotlayouten. Innloggingen har en dekorativ WebGL-skulptur med statisk SVG-reserve; dashboardet beregner aktivitet og mål fra innlastede økter, uten beredskapsprosent.

## Lokalt

Node 22.22+, pnpm 10+, Docker for lokal Supabase. Appen lytter bare på `127.0.0.1:3210`.

Konfigurasjon injiseres i prosessen via godkjent secretprofil. ElevenLabs' offisielle onboarding kan også lagre prosjektets nøkkel i git-ignorert `.env.local`; nøkkelen skal aldri inn i kode, logger eller commits. Appen avviser tilgang ved manglende konfigurasjon. Leverandørtester krever separat kostnadsgodkjenning.

Opprett et eget loopback-bundet nettverk én gang; behold det hvis det allerede finnes:

```sh
docker network create --subnet 10.247.231.0/24 --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 muntlig-mvp-local
pnpm install --frozen-lockfile
pnpm db:start
pnpm dev
```

Supabase bruker eget prosjekt `muntlig-mvp`: API 56321, database 56322 og Studio 56323. Ikke erstatt eller nullstill andre lokale prosjekter. Migrasjoner kjøres ved første oppstart. `scripts/dev.mjs` henter bare denne lokale instansens konfigurasjon, holder skrivenøkkelen i prosessminnet og starter med alle eksterne leverandører avslått.

På en eksisterende lokal database: kjør `pnpm exec supabase migration up --local` før appen startes. Migrasjonene `20261107150000_session_conversations.sql`, `20261107170000_conversation_cleanup.sql` og `20261107180000_cleanup_recovery.sql` lagrer serverens private agent-/samtalebinding, bekreftet opprydding og gjenfinnbar agent-ID etter en sen oppstart. `20261107190000_practice_plan.sql` låser elevens målvalg, fokus og øvingsønske til økten og fyller inn planen for eldre økter. Ikke nullstill databasen for å installere dem.

Kontoer opprettes administrativt; selvregistrering er avslått. `supabase/scripts/bootstrap-disposable-users.sql` oppretter syntetisk testskole, lærer og elev. Bruk egne, lokalt genererte passord via psql-variabler; ikke commit eller skriv dem i dokumentasjonen. `pnpm test:db` oppretter og rydder sine egne testkontoer automatisk.

## Elevflyt

Elever går fra Arbeidsrom til **Muntlig**, velger en publisert fagpakke, ett til tre kompetansemål, fokus og et valgfritt øvingsønske. Planen følger tekst-, tale- og avatarsamtalen og gjennomgangen; den publiserte fagpakken endres ikke. Oppretting og publisering av fagpakker er fortsatt forbeholdt lærer og admin.

Tale- og avatarrommet viser bare nåværende mål over samtalen. Hele mållisten, kildene og koblingene ligger under **Fagstoff og mål**, lukket som standard. Seksjonen og kildevinduene kan brukes med tastatur.

Arbeidsrom viser aktivitet, faktisk øvingstid, undersøkte mål og fire milepæler fra lagrede økter. Dashboardet bruker de 20 nyeste øktene og oppgir avkorting. **Mine økter** henter hele historikken sidevis, beholder synlige rader ved hentefeil og lenker til øving eller lagret gjennomgang. Det er øktens valgte mål som telles, ikke alle målene i fagpakken.


## Leverandører

`pnpm dev --providers` tillater eksterne kall, men bare med godkjente prosjektnøkler fra egen secretprofil eller ElevenLabs-onboardingen under. Nøkler fra andre prosjekter skal ikke gjenbrukes. Ingen automatisk betalt fallback.

| Konfigurasjon | Bruk |
|---|---|
| `OPENAI_API_KEY`, valgfri `OPENAI_MODEL`, `OPENAI_BASE_URL` | Tekstøkter og målforslag. Standardmodell `gpt-4.1-mini`. Ikke nødvendig for tale eller avatar. |
| `ELEVENLABS_API_KEY`, valgfri `ELEVENLABS_VOICE_ID`, `ELEVENLABS_BASE_URL` | ElevenLabs Agents håndterer mikrofon, fagdialog, stemme og transkript. Browser-SDK-ens støttede regioner tillates; Singapore er deaktivert. |
| `SIMLI_API_KEY`, valgfri `SIMLI_FACE_ID` | Simli Compose viser avataren i ElevenLabs-samtalen. Standardansikt er Anna; ansiktet velges bare på serveren. Permanente nøkler blir på serveren. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MUNTLIG_DATABASE_WRITE_KEY` | Serverkonfigurasjon ved annen kjøring enn lokal `pnpm dev`; migrasjonene må være installert. |

Produksjonskjøring krever i tillegg `PROVIDER_CALLS_ENABLED=true`. En API-nøkkel alene aktiverer ingen leverandør. Manglende tilgang gir 503, ikke forhåndsskrevne svar.

Offisiell ElevenLabs-onboarding:

```sh
npx -y @elevenlabs/cli@latest onboard init
# Følg godkjenningsflyten på egen konto; ikke lim inn API-nøkler i chat.
npx -y @elevenlabs/cli@latest onboard connect --env-path .env.local
npx -y @elevenlabs/cli@latest onboard check --env-path .env.local
```

`onboard check` kontrollerer nøkkel og SDK uten å generere lyd. CLI-ets valgfrie `onboard test` bruker kreditter og skal bare kjøres etter eksplisitt godkjenning. Det er en kort TTS-test, ikke en test av Agents-samtale eller Simli.

Nye tale- og avatarøkter bestiller eksplisitt Eleven v4 Turbo (`eleven_v4_turbo`) som stemmemodell, med PCM16 mono 24 kHz. Modellen støttes av [ElevenLabs Agents-API-et](https://elevenlabs.io/docs/api-reference/agents/create). Fagdialogens språkmodell er `gpt-5.4-mini`, kjørt hos ElevenLabs. Allerede opprettede agenter endres ikke.

Standardstemmen er Nadia K (`BRY5wALXFkJsxVM6sEOH`). ElevenLabs Voice Library oppgir norsk, Oslo-uttale og verifisering for Eleven v4 Turbo; dette er leverandørmetadata, ikke en lyttetest i fagpraten. `ELEVENLABS_VOICE_ID` overstyrer valget. Stemmen velges eksplisitt når en ny agent opprettes; eksisterende agenter endres ikke. Åpningen går direkte til første fagspørsmål, og instruksjonene ber om korte, hverdagslige oppfølginger fremfor mål-oppramsing og standardfraser. `turn_timeout: 30` gir tenketid før agenten purrer.

Læreren skal lede en sammenhengende fagprat, svare på elevens spørsmål og følge faglige avstikkere innenfor kildene. Valgte mål gir retning, ikke et fast manus: temaer kan tas i annen rekkefølge og besøkes på nytt. Når alle mål er berørt, skal samtalen fortsette med fordypning, eksempler eller det eleven fortsatt strever med – ikke avsluttes automatisk.

Tale er en kontinuerlig ElevenLabs Agents-samtale, ikke separate opptak og TTS-turer. Ren tale bruker WebRTC. Avatar bruker ElevenLabs WebSocket med PCM16 mono 24 kHz, konvertert fortløpende til Simlis PCM16 mono 16 kHz. Direkte ElevenLabs-avspilling dempes før lyd starter; Simlis returlyd er eneste hørbare lyd og spilles sammen med avatarvideoen. Bare ElevenLabs åpner et varig mikrofonspor. Mikrofontillatelse hentes etter startklikket og før leverandørtilgang bestilles. Avatarmodulen lastes allerede på startsiden uten konstruktør eller leverandørbestilling; ved oppstart overlapper importen med tokenforespørselen.

Simli bestilles med et midlertidig økttoken fra den beskyttede serverruten. Den permanente nøkkelen og ansiktsvalget sendes ikke fra browseren. Adapteren bevarer konverteringens fase mellom lydbiter, sender korte haler ved taleslutt og tømmer både lokal og ekstern lydkø ved avbrudd. Svartekst venter på Simlis `speaking`; `silent`, avbrudd og stopp frigir gjenværende foreløpig tekst. Dette er synk per svar, ikke ord-for-ord-alignment. Videoelementet er dempet; et separat audioelement spiller Simlis synkroniserte returlyd.

Samtaletilgang bestilles først etter at Simli viser første videoframe: parallell oppstart kan brenne øktens engangsbinding hvis avataren feiler. Oppstart kan avbrytes, har en frist på 30 sekunder og rydder også en sen tilkobling. Stopp, sidebytte og frakobling lukker lyd, video og transport. Ingen betalt forhåndsoppstart eller automatisk leverandørfallback brukes.

Serveren oppretter en privat agent fra øktens låste fagpakke. Klienten får ingen promptoverstyringer. `show_goal` kan bytte mellom elevens valgte mål, også tilbake til tidligere temaer; andre mål avvises. Vist mål er ikke automatisk evidens. Ved avslutning henter serveren transkriptet fra den serverbundne samtalen og kontrollerer elevsitat, støtte, mål og kilder på nytt. Et sitat kan bare knyttes til målet eleven faktisk snakket om, og tidligere hjelp beholdes ved temabytte. Pågående transkript gir 425 og et eksplisitt nytt hentevalg, ikke oppdiktet gjennomgang. Én oppstartsbestilling og samtale per økt; omlasting eller en sen forespørsel kan aldri overta bestillingen. Etter mislykket leverandøroppstart må økten avsluttes og en ny opprettes.

Ordrett gjentakelse av lærerens tidligere ord regnes som støtte, også når forklaringen kom før første elevsvar eller ble gitt mens et annet mål var aktivt. Dette er en ekstra deterministisk kontroll, ikke en semantisk vurdering av omskrevet hjelp. Gjennomgangen lagrer høyst 60 tekstinnlegg: elevinnlegg med registrert evidens beholdes, og de eldste andre innleggene fjernes først. Lange samtaler har derfor ikke nødvendigvis et fullstendig lagret transkript.

Appen lagrer ikke rålyd eller avatarvideo. ElevenLabs-agenten bestilles med lydopptak avslått og sju dagers transkriptlagring. Midlertidige agentkonfigurasjoner slettes ved mislykket oppstart og etter at avslutningen har lagret transkriptet. Ved mislykket opprydding forblir gjennomgangen lesbar og viser «Prøv opprydding igjen», også etter omlasting. Knappen sender en eksplisitt avslutningsbestilling; GET av gjennomgangen sletter ingenting. En sen oppstart kan registrere sin egen agent-ID for opprydding, men kan aldri binde en ny samtale etter avslutning. Det finnes ingen automatisk ryddejobb for forlatte økter eller prosesskrasj mellom leverandøroppretting og databaseskriving; slike rester må håndteres administrativt før skolepilot. Simli og ElevenLabs bestilles med samme demogrense på 600 sekunder i avatarmodus (`LIMITS.avatarSeconds`). Simli har fortsatt høyst 60 sekunder tomgang. Tale uten avatar beholder fagpakkens varighet pluss slingringsmonn. Appens klokke og lokale avslutning regnes fra før bestilling av avatartilgang, slik at normal tidsavslutning kommer før Simlis harde grense. Siste minutt varsles, og nådd tidsgrense vises som normal avslutning med vei til gjennomgangen, ikke som nettverksfeil. En kontooppgradering endrer ikke appens egen demogrense.

ElevenLabs' signerte URL og leverandørutstedte samtale-ID valideres mot riktig agent, region og sti. Manglende eller avvikende binding gir 502. Tidligere live-kontroller under beskriver den daværende HeyGen-integrasjonen og er ikke kvalitetsbevis for Simli.

## Kontroller

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:db
# Med pnpm dev kjørende og eksterne leverandører avslått:
pnpm test:db --api
```

Databasesmoken er låst til den lokale `muntlig-mvp`-instansen. Den beviser avvisning av forfalskede KI-turer/evidens, eier-/lærerisolasjon, revisjonskonflikter og atomisk kvote. API-varianten prøver faktisk innlogging, oppretting/publisering, elevtilgang, rolle-/CSRF-vern og fravær av server-skrivenøkkelen i HTML og klientbundler. Den stopper hvis KI-leverandører er aktivert.
Simli-cutoveren er kontrollert 7. november 2026: 53 tester, typekontroll, lint og produksjonsbygg passerer. Den faktiske avatar-ruten avviste uinnlogget (401), fremmed origin (403), fremmed eier (404), ugyldig handling (400), feil øktmodus (403), avslått leverandørbryter (503) og avsluttet økt (409). En lokal browser-replay bekreftet første frame før ElevenLabs-bestilling, dempet direkteavspilling, løpende PCM-konvertering, tømming ved avbrudd og null levende testspor etter stopp.

To godkjente live-forsøk brukte bare syntetisk norsk tale og lokal testskole. Tidene under er målt fra startklikk, ikke sammenlignbare leverandørbenchmarks:

| Forsøk | Første synlige videoframe | Første målte returlyd | Observert forløp |
|---|---:|---:|---:|
| 1 | 1 935 ms | 5 496 ms | 25,9 s |
| 2 | 2 011 ms | 5 188 ms | 65,8 s |

Faktisk ElevenLabs-transkript bekreftet et konkret hjelpeeksempel, elevavbrudd, nytt svar og retur til maktfordelingen og Stortingets rolle. Simli-videoen beveget munnen under returlyden. Det er ikke en måling av fonem-/leppesynkavvik eller en subjektiv kvalitetsgodkjenning. Etter transportstopp var null testspor, sockets og WebRTC-forbindelser åpne. Begge økter ble avsluttet med HTTP 200 og midlertidige agenter slettet; gjennomgangen viste sju innlegg og ingen udokumentert evidens. Ingen ekstra betalte forsøk eller kontoendringer er gjort.


Utført 7. november 2026 før videotemporettingen: 41 domene-, samtale-, målplan-, oppryddings- og PCM-tester, typekontroll, lint og produksjonsbygg. Videotemporettingen legger til en PCM-regresjon for første 400 ms, umiddelbar hale og tapsfri lyd; den feilet før endringen og passerte etter. Den lokale database/API-smoken er kjørt på nytt mot separat produksjonsbygg med leverandører avslått: faktisk innlogging, oppretting/publisering, eier-/rolleskille, CSRF, kvoter og ingen server-skrivenøkkel i HTML eller klientbundler. Beskyttet avatarstart, samtalestart og avslutning returnerte 401 uten innlogging. `pnpm audit --prod` fant ingen kjente sårbarheter.

Faktisk browserkontroll ved 390, 1280 og 1568 px: lærer/elev og tomkontoer; KPI-er fra tre og tjue lagrede syntetiske økter; avkortet historikk markert som ukjent, ikke null; tastaturinnlogging, kilde-/avslutningsdialog med Escape og fokusretur; tavlens mål/kilder/koblinger; mikrofonnekt uten leverandørbestilling; avslutning uten samtale gir tre uundersøkte mål. Mobiloverflyt er rettet, og de tre tavlevisningenes tekstkontrast er målt til minst 4,85:1.

Innloggingen bruker en original båndskulptur og et partikkelfelt i native WebGL, uten ny 3D-avhengighet. Formen roterer automatisk; musen gir en subtil, avgrenset dreining, og klikk bryter ikke formen opp. Et diskret pause-/startikon kan brukes med tastatur og styrer brukerens eksplisitte pausevalg. Skjemafokus, skjult side og en scene utenfor viewport stanser bevegelsen midlertidig uten å endre pausevalget. Redusert bevegelse nullstiller museforskyvningen, gir en statisk form uten musefølgning og skjuler pauseikonet. Uten WebGL eller nødvendige browser-API-er, og etter konteksttap, vises en statisk SVG uten å sperre innloggingen. Ingen mikrofon eller leverandør brukes.

Fargene bruker skoggrønn `#1F3D2B` til tekst og innloggingens fond, lys sand `#F5F0E6` som base og lilla `#6D28D9` til primærhandlinger, fokus og aktive valg. Sandfargede sekundærflater og dempet lavendel skiller paneler og valgte mål. Felles tokens brukes i innlogging, dashboard, navigasjon, fagpakker, øvingsrom, kilder og gjennomgang; suksess, feil og støtte beholder semantiske farger. Brødtekstens felles forgrunn/bakgrunn-par er målt til minst 4,64:1, primærknappen til 6,93:1 og feiltekst til 5,55:1. Skulpturfokus og partikkeldybde er inspirert av [KODE Immersive](https://mobbin.com/sites/sections/4e3f95e7-be97-44a7-8ce8-362ff79c959a) og [SALT AND PEPPER](https://www.awwwards.com/inspiration/interactive-webgl-particles-on-hero-image-salt-and-pepper), ikke kopiert kode eller grafikk.

Browserkontroll av den kontinuerlige scenen: WebGL-tiden økte uten pekerinput, og stod stille ved pause, skjemafokus, redusert bevegelse og utenfor viewport. Musefølgningen gikk jevnt tilbake mot null ved pekerutgang. Tastaturstart, mobiltrykk og mobilpause er utøvd; touch-emulering aktiverte ikke musefølgning. Ingen WebGL-feil i normal flyt. Konteksttap ga synlig SVG, skjult pauseikon og et aktivt skjema. Ved 390 × 844 var innloggingsknappen synlig i første viewport uten horisontal overflyt. Palett og navigasjon er prøvd med lokale syntetiske lærer-/elevkontoer gjennom oppretting, publisering, kildevindu, tekst-/taleøving, historikk og gjennomgang på desktop og mobilvisning. Deaktivert taleoppstart beholdt lesbar tekst også ved hover; SVG-ens fargetoken ble løst riktig. KI-, tale- og avatarleverandørene var deaktivert: dette er UI-kontroll, ikke en leverandørtest.

Reviewrettingene er utøvd i browser: avbryt under mikrofontillatelse, start på nytt før gammel tillatelse svarer, og kontroller at sene testspor stoppes og fokus returnerer til startknappen. En isolert smoke gjennom det faktiske HeyGen-SDK-ets mikrofonkode brukte syntetisk lyd og lokal transport: ett dempet publisert spor, null levende HeyGen-spor etter tilkobling og etter stopp. Dette er ikke en leverandørtest eller måling av fysisk mikrofonindikator.

En egen race-smoke kjørte de faktiske `useAvatar`/`LiteAvatar` med syntetisk SDK-start og transport. Før retting oppstod overlappende oppstart, sen videofesting og et gjenværende testspor etter tidsavbrudd. Etter retting: bare én SDK-start om gangen, ingen videofesting fra avbrutt oppstart og null testspor etter sen fullføring. Ingen ekstern leverandør ble kontaktet.

En engangssmoke kjørte de faktiske samtale-/avslutningstjenestene mot lokal Supabase med syntetisk leverandørgrense: ett oppstarts­krav, lagring før agentsletting, idempotent avslutning, mislykket opprydding med nytt forsøk og opprydding ved manglende signert samtale-ID. Ingen ekstern leverandør ble kontaktet.

ElevenLabs-onboardingen er kjørt med CLI 1.9.0. `onboard check` passerte, og prosjektnøkkelens abonnement ble bekreftet som aktivt Creator. Etter eksplisitt godkjenning passerte én `onboard test`: HTTP 200, gyldig MP3 mono 44,1 kHz, 1,76 sekunder.

Etter separat godkjenning for maksimalt to minutter er ElevenLabs Agents + LiveAvatar prøvd i faktisk browser med syntetisk mikrofoninngang. En 47 sekunders samtale viste 720p-avatarvideo, transkriberte testsvar og ga et relevant oppfølgingsspørsmål. Elevens ene valgte mål, fokus og øvingsønske ble beholdt i historikken etter omlasting. Serverens gjennomgang lagret elevsitat med mål og kilde; `cleanupPending` var `false`, og testens mikrofonspor var stoppet. LiveAvatar-kanalens tidlige «connected»-melding beholdes nå mens SDK-et gjør ferdig mikrofonoppsettet. Ingen ekte elevdata er brukt. Testen er ikke en formell kvalitetsmåling av stemme eller leppesynk.

Den forenklede samtaleflaten er prøvd i faktisk browser med syntetisk testskole: mål/kilder/koblinger, kildevindu med Escape og fokusretur, 320 px og doblet tekststørrelse uten horisontal dokumentoverflyt. Ingen klientfeil ble registrert. Det synlige demovinduet bruker nettleserens ekte mikrofon-API med gitt tilgang til MacBook Pro-mikrofonen; syntetisk lyd er isolert i en egen headless profil. Disse kontrollene starter ingen leverandørsamtale og bekrefter ikke alene faktisk Turbo v4, toveis tale eller avbrytelser.

Separate, godkjente live-kontroller bekreftet `eleven_v4_turbo`, Jessica, norsk og `pcm_24000` på den faktisk opprettede agenten. Browseren mottok 1280 × 720-avatarvideo og fjernlyd; norsk syntetisk tale ble transkribert og fikk relevante oppfølgingsspørsmål. En tidligere kontroll bekreftet `turn_timeout: 30` og ingen ny purring i de knapt 25 sekundene fra siste svar til stopp. En ny godkjent test av den adaptive instruksen bekreftet en relevant faglig avstikker og faktisk barge-in: ElevenLabs sendte avbrudd 569 ms etter talestart, og LiveAvatar bekreftet avbruddet 127 ms senere. Forbindelsen falt ut under forsøket på retur til første tema; denne returen og subjektiv samtalekvalitet er ikke live-godkjent. Gjennomgangen lagret seks innlegg uten å tildele udokumentert evidens, med `cleanupPending: false`; testspor og leverandørforbindelser var stoppet.

Bruddet brukeren så rundt tre minutter var leverandørens `MAX_DURATION_REACHED` etter 120 sekunder avataraktivitet. Kontoen avviste også en tokenbestilling for 720 sekunder med HTTP 400 og maksimalt 120 tillatte sekunder. UI-en viser nå **maks 2 min** både ved modusvalg og i samtalerommet. Timeren måler tilkoblet fagsamtale, ikke gjenstående avatartid; avataroppstart skjer før samtaletilkoblingen. Frakobling viser vei til gjennomgangen, ikke en umulig omstart av samme samtale. Årsaken til det tidligere bruddet er ikke dermed bekreftet for den siste live-testen. Lengre avatarøkter krever endret leverandørgrense; kontoen er ikke oppgradert.

Adaptiv temaflyt er kontrollert med en feilende-før/passerende-etter regresjon gjennom den faktiske transkriptgjenoppbyggingen. En isolert browser-smoke kjørte den faktiske samtalekomponenten og hookene med syntetiske leverandørgrenser: frem/tilbake mellom valgte mål, avvisning av uvalgte mål og frakobling → gjennomgang. Begge SDK-er og alle testspor stoppet; ingen klientfeil. Dette er ikke en live-kvalitetsmåling av den nye lærerinstruksen eller av avbrytelser.

Videotemporettingen ble prøvd i faktisk Chrome med syntetisk video og leverandørgrense: ingen leverandørbestilling før start, sen mikrofontillatelse etter avbrudd ga null levende spor og null leverandørbestillinger, svartekst ventet på avatarens talestart, korreksjon ble beholdt, duplikat talestart avslørte ikke neste svar, og frakobling bevarte ventende tekst og stoppet testsporene. Dette er historisk transportbevis, ikke live-video, subjektiv leppesynk eller en garanti for Simli-responstid.

Opus fant at flere svar før én avatar-talestart kunne forskyve tekstkøen. Køen frigir nå alle ventende svar ved ny talestart, og to regresjoner feilet med gammel kø og passerer med rettingen. Totalt 44 tester, typekontroll, lint og produksjonsbygg passerer. Faktisk Chrome-replay bekreftet at neste tale viser neste svar, duplikat talestart ikke avslører det tidlig, og korrigert tekst beholdes ved avbrudd. Etter frakobling var null testspor levende og ingen klientfeil registrert. Dette bruker fortsatt syntetiske leverandørgrenser.

Palettbyttet er prøvd i faktisk browser ved 390 × 844 og 1440 × 1000: elevdashboard, Muntlig-valg, historikk, gjennomgang, kildevindu, lærerens editor og innloggingens feiltilstand. Ingen horisontal overflyt ble funnet. Valgte mål, fokusvalg, deaktivert oppstart, knappens hover og synlig tastaturfokus er kontrollert. Alle målte normale tekstpar bestod AA; logotypens dekorative punkt er ikke brødtekst.

## Brukskvalitet

Muntlig starter med temavalg og «Start fagpraten». Mål, fokus, eget ønske, modus og kildeutdrag ligger under Innstillinger. Alle mål og «Forklare med egne ord» er forhåndsvalgt; minst ett mål kreves. Startklikket oppretter økten og starter mikrofonflyten uten et nytt startklikk i samtalerommet. En engangsbestilling i minnet, ikke URL-en eller lagret øktstatus, tillater dette. Omlasting, direkte lenke og tilbake-navigasjon krever et nytt eksplisitt startklikk. Den nettopp opprettede økten brukes direkte uten en ekstra GET før oppstart.

Kontrollert 8. november 2026: 54 tester, typekontroll, lint og produksjonsbygg passerer. Faktisk Next-app startet mikrofonflyten med én sesjons-POST og uten ekstra sesjons-GET; omlasting startet ingen mikrofon. To valgte mål, fokus, trimmet ønske og talemodus ble kontrollert i den serverlagrede planen. Mobil, dialog/kildelesing, Escape/fokusretur, temabytte, redusert bevegelse og null valgte mål ble prøvd i Chrome. Et isolert StrictMode-replay bekreftet én medieoppstart og null levende testspor også når første avatarframe kom etter avbrudd; det siste lekket ett spor før rettingen. Negative avatar-API-kall ga 401/403/404/400/503/409 som forventet, og diff/klientbundler bestod secretskanning. Leverandørgrensene i replayet var syntetiske; ingen nye betalte samtaler eller lyttetest av Nadia ble kjørt.

Opprydding fra en avbrutt avatarstart frigir bare medieelementene den fortsatt eier. To regresjoner dekker sen ferdigstilling med og uten en nyere avatar. Chrome-replayet «avbryt under backoff → start på nytt → gammel start feiler sent» beholdt begge nye spor og samme bilde-/lydstrøm uten ekstra oppstart. Bekreftet avslutning stoppet alle testspor. Totalt 56 tester, typekontroll, lint og produksjonsbygg passerer. Leverandørgrensene var syntetiske; ingen betalte samtaler ble startet.

Innlasting viser plassholdere som følger oppsettet for arbeidsrom, økt, historikk og gjennomgang, også før serverdata er klare. GET-kall har 15 sekunders frist og skrivekall 90 sekunder. Nettverksfeil vises på norsk med nytt forsøk; historikken beholder allerede lastede økter. Ved tastatur-retry beholdes fokus i hovedinnholdet mens det lastes og flyttes til overskriften når innholdet er klart.

Menyen på små skjermer holder tastaturfokus inne, lukker med Escape og returnerer fokus til menyknappen. Innholdet bak menyen er `inert`; menyen kan rulles ved stor tekst. Avbrutt oppstart eller avslutning kan ikke navigere til en forlatt visning. Avbrutt klientforespørsel er ikke en tilbakeføring av en handling som serveren allerede har lagret.

Informasjon er blå, fullført/selvstendig grønn, støtte/advarsel gul og feil/destruktive handlinger røde. Merkevarens lilla brukes til handlinger og valg, ikke målresultater. Statusene har tekst eller symboler i tillegg til farge. Gjentakende innledningstekst er fjernet; forklaringer om kilder, personopplysninger, manglende leverandørtilgang og at gjennomgangen ikke er en karakter er beholdt. Nye KI-mål krever bekreftelse før skrevne mål erstattes og overskriver ikke lærerens egen introduksjon.

Utført i faktisk Chrome med syntetisk testskole: 15,1 sekunders tidsavbrudd, 503-feil og tastatur-retry i økt/gjennomgang, samt historikkfeil uten tap av synlige rader. Ved 320 px og emulert 200 % tekst ble Arbeidsrom, Muntlig, historikk, gjennomgang og trygghetsinformasjon kontrollert uten horisontal overflyt. Tolv Tab-steg holdt seg i mobilmenyen; Escape og kildedialog returnerte fokus riktig. Målte tekstpar bestod AA (laveste målte forhold 4,64:1). Fontforstørrelsen ble satt etter hydrering; ingen konsollfeil i den kontrollerte flyten.

En isolert browserkontroll av de faktiske komponentene reproduserte sen navigering etter forlatt oppstart og avslutning. Etter retting ble begge forespørslene avbrutt og ingen sen navigeringscallback kjørt. Samme kontroll prøvde avbryt/bekreft av nye KI-mål og bevart lærerintroduksjon. Disse kontrollene brukte syntetisk transport, ikke betalte leverandørkall. Dette er målrettet browserkontroll, ikke en full WCAG- eller skjermleserrevisjon.

En kontroll mot den faktiske appen forsinket arbeidsromsoppdateringen etter lagret avslutning. Før retting overstyrte det sene svaret nettleserens Tilbake. Etter retting ble valgt visning beholdt, mens den avsluttede økten lå lagret i historikken. Lærerens lagring og forhåndsvisning er også prøvd etter rettingen.

Opus-reviewens avkortingsfunn er reprodusert med 35 syntetiske økter: dashboardet laster 20. «Din vei» viser nå en nedre grense eller «i de 20 siste øktene» på alle nådde milepæler; alle 35 kan hentes i Mine økter. Forstørret milepæltekst passer ved 320 px og 200 % tekst. Avatartokenets faktiske HTTP-kall er prøvd med en isolert transportstub: `max_session_duration` er 120, og to-minuttersgrensen vises før oppstart. Dette er ikke et nytt betalt leverandørkall eller en live-måling av leverandørens tidsavbrudd.

## Design og Visual Edit

[Bevegelsesgjennomgang og avviste kandidater](plans/README.md). Navigasjon, fagtekst og evidens holdes statiske.

Visual Edit skal kjøre på `https://design.agent-native.com`, aldri en lokal Design-server. `.agent-native/design-routes.json` navngir tre faktiske visninger. Send alltid også `paths: ["/", "/new/example", "/privacy"]` til `open-visual-edit`; CLI-et legger ellers til Next-buildfiler som ekstra nettsider, selv med et manuelt manifest.

Appen krever sin egen innlogging. En signed-out Design-capability gir ikke tilgang til skolens kontoer. Ikke fjern autentisering eller presenter innloggingsskjermen som et ferdig produktcanvas; bruk en autentisert appøkt/integrasjon. Visual Edit er derfor ikke ferdig koblet i denne kjøringen.

## Container og Railway

`Dockerfile` bygger fra låsefilen med pnpm 10.33.0 og et digest-låst Node 22-image. Dermed trenger ikke byggingen Railpacks nedlasting av `mise`. Next.js bruker standalone-serveren; produksjonsavhengighetene følger også med fordi PDF.js laster native canvas dynamisk.

`railway.toml` velger Dockerbyggeren og `node server.js` eksplisitt, i stedet for tjenestens tidligere pnpm-startkommando. Lokale `pnpm dev` og `pnpm start` er uendret.

```sh
docker build --platform linux/amd64 --tag muntlig .
docker run --rm --publish 127.0.0.1:3210:3000 muntlig
```

Containeren kjører som `node`, ikke root, og lytter på `0.0.0.0` med `PORT` fra runtime-miljøet (standard 3000). Uten databasekonfigurasjon avvises datatilgang. Railway bruker de eksisterende servervariablene fra tabellen over; secrets skal ikke være build-argumenter eller ligge i bildet. `.dockerignore` tillater bare nødvendige kilde- og byggfiler.

Publisering krever merget, gjennomgått kode, ren deploy-checkout og Railway-status `SUCCESS` før den regnes som levert. Kontroller deretter den autentiserte startflaten og Innstillinger uten å starte en betalt samtale. Deploy-ID og commit føres i Plane.

## Avgrensning før skolepilot

Dette er en utviklingsversjon, ikke en produksjonsgodkjent skoletjeneste. Kildehenting er avgrenset til målets publiserte kildeutdrag, ikke en ferdig pgvector-/hybridsøkemotor. Feide, skoleadministrasjon, automatiske sletterutiner og enterprise-driftsoppsett er ikke implementert. Skoleeier må avklare DPIA, DPA, rettigheter, leverandørregioner, lagringstid og tilgjengelighet før ekte elevdata brukes.

GitHub: [AIKI-AS/muntlig](https://github.com/AIKI-AS/muntlig), offentlig. Elevdemoen leveres via egen branch og PR med før/etter-bilder ved synlige endringer og uavhengig review. Railway-demoen bruker bare syntetiske testdata; dette er ikke en godkjent skolepilot.
