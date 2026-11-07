# Muntlig

Skolestyrt muntlig fagtrening. Next.js, React, TypeScript, Supabase, OpenAI, ElevenLabs og LiveAvatar Lite.

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
| `LIVEAVATAR_API_KEY`, `LIVEAVATAR_AVATAR_ID` | HeyGen LiveAvatar Lite viser mennesket i samme ElevenLabs-samtale. Krever også ElevenLabs-tilgang. Permanente nøkler blir på serveren. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MUNTLIG_DATABASE_WRITE_KEY` | Serverkonfigurasjon ved annen kjøring enn lokal `pnpm dev`; migrasjonene må være installert. |

Produksjonskjøring krever i tillegg `PROVIDER_CALLS_ENABLED=true`. En API-nøkkel alene aktiverer ingen leverandør. Manglende tilgang gir 503, ikke forhåndsskrevne svar.

Offisiell ElevenLabs-onboarding:

```sh
npx -y @elevenlabs/cli@latest onboard init
# Følg godkjenningsflyten på egen konto; ikke lim inn API-nøkler i chat.
npx -y @elevenlabs/cli@latest onboard connect --env-path .env.local
npx -y @elevenlabs/cli@latest onboard check --env-path .env.local
```

`onboard check` kontrollerer nøkkel og SDK uten å generere lyd. CLI-ets valgfrie `onboard test` bruker kreditter og skal bare kjøres etter eksplisitt godkjenning. Det er en kort TTS-test, ikke en test av Agents-samtale eller LiveAvatar.

Nye tale- og avatarøkter bestiller eksplisitt Eleven v4 Turbo (`eleven_v4_turbo`) som stemmemodell, med PCM16 mono 24 kHz. Modellen støttes av [ElevenLabs Agents-API-et](https://elevenlabs.io/docs/api-reference/agents/create). Fagdialogens språkmodell er fortsatt `gpt-4.1-mini`. Allerede opprettede agenter endres ikke.

Standardstemmen er Jessica (`cgSgspJ2msm6clMCkdW9`), en kvinnelig samtalestemme som matcher demoens dameavatar. `ELEVENLABS_VOICE_ID` overstyrer dette. Stemmen velges eksplisitt når en ny agent opprettes; eksisterende agenter endres ikke. Åpningen går direkte til første fagspørsmål, og instruksjonene ber om korte, hverdagslige oppfølginger fremfor mål-oppramsing og standardfraser. `turn_timeout: 30` gir tenketid før agenten purrer.

Læreren skal lede en sammenhengende fagprat, svare på elevens spørsmål og følge faglige avstikkere innenfor kildene. Valgte mål gir retning, ikke et fast manus: temaer kan tas i annen rekkefølge og besøkes på nytt. Når alle mål er berørt, skal samtalen fortsette med fordypning, eksempler eller det eleven fortsatt strever med – ikke avsluttes automatisk.

Tale er en kontinuerlig ElevenLabs Agents-samtale, ikke separate opptak og TTS-turer. Ren tale bruker WebRTC. Avatar bruker ElevenLabs WebSocket med PCM16 mono 24 kHz videresendt til HeyGen LiveAvatar Lite; direkte ElevenLabs-avspilling dempes før lyd starter. Browserkoden forhåndslastes uten å bestille leverandørtilgang. SDK 0.0.20s unødvendige mikrofonstart slås av i Lite-modus; bare ElevenLabs skal åpne et varig mikrofonspor. Mikrofontillatelse hentes etter startklikket og før leverandørtilgang bestilles. Oppstart kan avbrytes, og sene tillatelser stopper sporene uten å starte samtalen. SDK-oppstarter serialiseres frem til tidligere oppstart og opprydding er ferdig. Avbrutt oppstart kan ikke feste video; hvis SDK-et fullfører etter tidsavbrudd, stoppes økten. Avbrudd tømmer avatarens lydkø; avslutning, sidebytte og frakobling stopper forbindelsene.

Lyden primes med SDK-ets dokumenterte 400 ms. Deretter sendes hver mottatte lydbit straks, i pakker på høyst ett sekund, slik at siste del ikke venter på den dempede ElevenLabs-avspillingen. Svarteksten vises ved avatarens faktiske `agent.speak_started`, ikke når ElevenLabs allerede har skrevet hele svaret. Alle ventende svar vises samlet ved en ny talestart: én avatar-utterance kan inneholde flere svar, så en én-til-én-kø ville forskjøvet neste svartekst. Avbrudd, korreksjon og stopp beholder foreløpig tekst. Dette er synk per svar, ikke ord-for-ord-alignment.

Samtaletilgang bestilles fortsatt først etter at avataren er klar: parallell oppstart kan brenne øktens engangsbinding hvis avataren feiler. Ingen betalt forhåndsoppstart brukes for å love «instant» video. Den endrede mikrofonstarten, den kortere primingen og faktisk videosynk krever en ny godkjent live-kontroll før de kan kvalitetsgodkjennes.

Serveren oppretter en privat agent fra øktens låste fagpakke. Klienten får ingen promptoverstyringer. `show_goal` kan bytte mellom elevens valgte mål, også tilbake til tidligere temaer; andre mål avvises. Vist mål er ikke automatisk evidens. Ved avslutning henter serveren transkriptet fra den serverbundne samtalen og kontrollerer elevsitat, støtte, mål og kilder på nytt. Et sitat kan bare knyttes til målet eleven faktisk snakket om, og tidligere hjelp beholdes ved temabytte. Pågående transkript gir 425 og et eksplisitt nytt hentevalg, ikke oppdiktet gjennomgang. Én oppstartsbestilling og samtale per økt; omlasting eller en sen forespørsel kan aldri overta bestillingen. Etter mislykket leverandøroppstart må økten avsluttes og en ny opprettes.

Ordrett gjentakelse av lærerens tidligere ord regnes som støtte, også når forklaringen kom før første elevsvar eller ble gitt mens et annet mål var aktivt. Dette er en ekstra deterministisk kontroll, ikke en semantisk vurdering av omskrevet hjelp. Gjennomgangen lagrer høyst 60 tekstinnlegg: elevinnlegg med registrert evidens beholdes, og de eldste andre innleggene fjernes først. Lange samtaler har derfor ikke nødvendigvis et fullstendig lagret transkript.

Appen lagrer ikke rålyd eller avatarvideo. ElevenLabs-agenten bestilles med lydopptak avslått og sju dagers transkriptlagring. Midlertidige agentkonfigurasjoner slettes ved mislykket oppstart og etter at avslutningen har lagret transkriptet. Ved mislykket opprydding forblir gjennomgangen lesbar og viser «Prøv opprydding igjen», også etter omlasting. Knappen sender en eksplisitt avslutningsbestilling; GET av gjennomgangen sletter ingenting. En sen oppstart kan registrere sin egen agent-ID for opprydding, men kan aldri binde en ny samtale etter avslutning. Det finnes ingen automatisk ryddejobb for forlatte økter eller prosesskrasj mellom leverandøroppretting og databaseskriving; slike rester må håndteres administrativt før skolepilot. LiveAvatar bestilles med en eksplisitt leverandørhåndhevet grense på 120 sekunder (`LIMITS.avatarSeconds`), også om browseren krasjer. Grensen samsvarer med demoens to-minutterskonto og vises før avatarstart; ingen ti-minuttersbestilling eller ubegrenset standardverdi brukes.

Avatarens signerte URL og leverandørutstedte samtale-ID valideres mot riktig agent, region og sti. Manglende eller avvikende binding gir 502. Den godkjente live-testen 7. november 2026 bekreftet faktisk oppstart og at serveren hentet transkriptet fra samme bundne samtale.

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

Videotemporettingen er prøvd i faktisk Chrome med syntetisk video og leverandørgrense: ingen leverandørbestilling før start, sen mikrofontillatelse etter avbrudd gir null levende spor og null leverandørbestillinger, svartekst venter på avatarens talestart, korreksjon beholdes, duplikat talestart avslører ikke neste svar, og frakobling bevarer ventende tekst og stopper testsporene. Dette er ikke live-video, subjektiv leppesynk eller en garanti for faktisk responstid. En ny live-test på høyst to minutter er godkjent, men ennå ikke startet: `LIVEAVATAR_API_KEY` mangler i prosjektkonfigurasjonen.

Opus fant at flere svar før én avatar-talestart kunne forskyve tekstkøen. Køen frigir nå alle ventende svar ved ny talestart, og to regresjoner feilet med gammel kø og passerer med rettingen. Totalt 44 tester, typekontroll, lint og produksjonsbygg passerer. Faktisk Chrome-replay bekreftet at neste tale viser neste svar, duplikat talestart ikke avslører det tidlig, og korrigert tekst beholdes ved avbrudd. Etter frakobling var null testspor levende og ingen klientfeil registrert. Dette bruker fortsatt syntetiske leverandørgrenser.

Palettbyttet er prøvd i faktisk browser ved 390 × 844 og 1440 × 1000: elevdashboard, Muntlig-valg, historikk, gjennomgang, kildevindu, lærerens editor og innloggingens feiltilstand. Ingen horisontal overflyt ble funnet. Valgte mål, fokusvalg, deaktivert oppstart, knappens hover og synlig tastaturfokus er kontrollert. Alle målte normale tekstpar bestod AA; logotypens dekorative punkt er ikke brødtekst.

## Brukskvalitet

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

## Avgrensning før skolepilot

Dette er en utviklingsversjon, ikke en produksjonsgodkjent skoletjeneste. Kildehenting er avgrenset til målets publiserte kildeutdrag, ikke en ferdig pgvector-/hybridsøkemotor. Feide, skoleadministrasjon, automatiske sletterutiner og enterprise-driftsoppsett er ikke implementert. Skoleeier må avklare DPIA, DPA, rettigheter, leverandørregioner, lagringstid og tilgjengelighet før ekte elevdata brukes.

GitHub: [AIKI-AS/muntlig](https://github.com/AIKI-AS/muntlig), privat. Elevdemoen leveres via egen branch og PR med før/etter-bilder og uavhengig review. Ingen deploy er utført.
