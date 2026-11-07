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

På en eksisterende lokal database: kjør `pnpm exec supabase migration up --local` før appen startes. Migrasjonene `20261107150000_session_conversations.sql`, `20261107170000_conversation_cleanup.sql` og `20261107180000_cleanup_recovery.sql` lagrer serverens private agent-/samtalebinding, bekreftet opprydding og gjenfinnbar agent-ID etter en sen oppstart; ikke nullstill databasen for å installere dem.

Kontoer opprettes administrativt; selvregistrering er avslått. `supabase/scripts/bootstrap-disposable-users.sql` oppretter syntetisk testskole, lærer og elev. Bruk egne, lokalt genererte passord via psql-variabler; ikke commit eller skriv dem i dokumentasjonen. `pnpm test:db` oppretter og rydder sine egne testkontoer automatisk.

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

Tale er en kontinuerlig ElevenLabs Agents-samtale, ikke separate opptak og TTS-turer. Ren tale bruker WebRTC. Avatar bruker ElevenLabs WebSocket med PCM16 mono 24 kHz videresendt til HeyGen LiveAvatar Lite; direkte ElevenLabs-avspilling dempes før lyd starter. Bare ElevenLabs beholder et mikrofonspor. HeyGen-SDK 0.0.20 åpner et spor selv med `defaultMuted`; det publiseres dempet og stoppes før ElevenLabs kobler til. Mikrofontillatelse hentes etter startklikket og før leverandørtilgang bestilles. Oppstart kan avbrytes, og sene tillatelser stopper sporene uten å starte samtalen. SDK-oppstarter serialiseres frem til tidligere oppstart og opprydding er ferdig. Avbrutt oppstart kan ikke feste video; hvis SDK-et fullfører etter tidsavbrudd, stoppes det sene sporet og økten. Avbrudd tømmer avatarens lydkø; avslutning, sidebytte og frakobling stopper forbindelsene.

Serveren oppretter en privat agent fra øktens låste fagpakke. Klienten får ingen promptoverstyringer. `show_goal` kan bare følge målrekkefølgen; vist mål er ikke automatisk evidens. Ved avslutning henter serveren transkriptet fra den serverbundne samtalen og kontrollerer elevsitat, støtte, mål og kilder på nytt. Pågående transkript gir 425 og et eksplisitt nytt hentevalg, ikke oppdiktet gjennomgang. Én oppstartsbestilling og samtale per økt; omlasting eller en sen forespørsel kan aldri overta bestillingen. Etter mislykket leverandøroppstart må økten avsluttes og en ny opprettes.

Appen lagrer ikke rålyd eller avatarvideo. ElevenLabs-agenten bestilles med lydopptak avslått og sju dagers transkriptlagring. Midlertidige agentkonfigurasjoner slettes ved mislykket oppstart og etter at avslutningen har lagret transkriptet. Ved mislykket opprydding forblir gjennomgangen lesbar og viser «Prøv opprydding igjen», også etter omlasting. Knappen sender en eksplisitt avslutningsbestilling; GET av gjennomgangen sletter ingenting. En sen oppstart kan registrere sin egen agent-ID for opprydding, men kan aldri binde en ny samtale etter avslutning. Det finnes ingen automatisk ryddejobb for forlatte økter eller prosesskrasj mellom leverandøroppretting og databaseskriving; slike rester må håndteres administrativt før skolepilot. LiveAvatar bestilles med 600 sekunders grense; faktisk håndheving er ikke live-verifisert.

Avatarens signerte URL må inneholde leverandørutstedt `conversation_id` og riktig agent, region og sti. Dokumentasjonen viser ikke dette komplette URL-formatet. Manglende eller avvikende binding gir 502; første godkjente live-test må bekrefte kontrakten før avatar kan regnes som verifisert.

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

Utført 7. november 2026: 34 domene-, samtale-, oppryddings- og PCM-tester, typekontroll, lint og database/API-smoke. Produksjonsbygg er også kjørt. Databasekontrollen prøver samtalebinding, dobbeltkrav, RLS-isolasjon, registrering av sen agent-ID uten samtalebinding og at bare bekreftet opprydding kan markeres etter avslutning uten å endre samtale-ID-ene.

Faktisk browserkontroll ved 390, 1280 og 1568 px: lærer/elev og tomkontoer; KPI-er fra tre og tjue lagrede syntetiske økter; avkortet historikk markert som ukjent, ikke null; tastaturinnlogging, kilde-/avslutningsdialog med Escape og fokusretur; tavlens mål/kilder/koblinger; mikrofonnekt uten leverandørbestilling; avslutning uten samtale gir tre uundersøkte mål. Mobiloverflyt er rettet, og de tre tavlevisningenes tekstkontrast er målt til minst 4,85:1.

Innloggingen bruker en original båndskulptur og et partikkelfelt i native WebGL, uten ny 3D-avhengighet. Formen roterer automatisk; musen gir en subtil, avgrenset dreining, og klikk bryter ikke formen opp. Et diskret pause-/startikon kan brukes med tastatur og styrer brukerens eksplisitte pausevalg. Skjemafokus, skjult side og en scene utenfor viewport stanser bevegelsen midlertidig uten å endre pausevalget. Redusert bevegelse nullstiller museforskyvningen, gir en statisk form uten musefølgning og skjuler pauseikonet. Uten WebGL eller nødvendige browser-API-er, og etter konteksttap, vises en statisk SVG uten å sperre innloggingen. Ingen mikrofon eller leverandør brukes.

Fargene følger «Deep Vintage Mood», palett 2 i [Visme-artikkelen](https://visme.co/blog/website-color-schemes/): dyp blå `#244855`, terrakotta `#E64833`, jordbrun `#874F41`, dempet blågrønn `#90AEAD` og krem `#FBE9D0`. Felles tokens brukes i innlogging, dashboard, navigasjon, fagpakker, øvingsrom, kilder og gjennomgang. Suksess, feil og støtte beholder semantiske farger; terrakotta brukes til dekorasjon, ikke brødtekst. Normal brødtekst har minst 4,82:1 kontrast på de felles flatene. Skulpturfokus og partikkeldybde er inspirert av [KODE Immersive](https://mobbin.com/sites/sections/4e3f95e7-be97-44a7-8ce8-362ff79c959a) og [SALT AND PEPPER](https://www.awwwards.com/inspiration/interactive-webgl-particles-on-hero-image-salt-and-pepper), ikke kopiert kode eller grafikk.

Browserkontroll av den kontinuerlige scenen: WebGL-tiden økte uten pekerinput, og stod stille ved pause, skjemafokus, redusert bevegelse og utenfor viewport. Musefølgningen gikk jevnt tilbake mot null ved pekerutgang. Tastaturstart, mobiltrykk og mobilpause er utøvd; touch-emulering aktiverte ikke musefølgning. Ingen WebGL-feil i normal flyt. Konteksttap ga synlig SVG, skjult pauseikon og et aktivt skjema. Ved 390 × 844 var innloggingsknappen synlig i første viewport uten horisontal overflyt. Palett og navigasjon er prøvd med lokale syntetiske lærer-/elevkontoer gjennom oppretting, publisering, kildevindu, tekst-/taleøving, historikk og gjennomgang på desktop og mobilvisning. Deaktivert taleoppstart beholdt lesbar tekst også ved hover; SVG-ens fargetoken ble løst riktig. KI-, tale- og avatarleverandørene var deaktivert: dette er UI-kontroll, ikke en leverandørtest.

Reviewrettingene er utøvd i browser: avbryt under mikrofontillatelse, start på nytt før gammel tillatelse svarer, og kontroller at sene testspor stoppes og fokus returnerer til startknappen. En isolert smoke gjennom det faktiske HeyGen-SDK-ets mikrofonkode brukte syntetisk lyd og lokal transport: ett dempet publisert spor, null levende HeyGen-spor etter tilkobling og etter stopp. Dette er ikke en leverandørtest eller måling av fysisk mikrofonindikator.

En egen race-smoke kjørte de faktiske `useAvatar`/`LiteAvatar` med syntetisk SDK-start og transport. Før retting oppstod overlappende oppstart, sen videofesting og et gjenværende testspor etter tidsavbrudd. Etter retting: bare én SDK-start om gangen, ingen videofesting fra avbrutt oppstart og null testspor etter sen fullføring. Ingen ekstern leverandør ble kontaktet.

En engangssmoke kjørte de faktiske samtale-/avslutningstjenestene mot lokal Supabase med syntetisk leverandørgrense: ett oppstarts­krav, lagring før agentsletting, idempotent avslutning, mislykket opprydding med nytt forsøk og opprydding ved manglende signert samtale-ID. Ingen ekstern leverandør ble kontaktet.

ElevenLabs-onboardingen er kjørt med CLI 1.9.0. `onboard check` passerte, og prosjektnøkkelens abonnement ble bekreftet som aktivt Creator. Etter eksplisitt godkjenning passerte én `onboard test`: HTTP 200, gyldig MP3 mono 44,1 kHz, 1,76 sekunder. Dette beviser ikke Agents-samtale, HeyGen eller leppesynk; brukeren godkjente bare CLI-testen. Ingen ekte elevdata er brukt.

## Design og Visual Edit

[Bevegelsesgjennomgang og avviste kandidater](plans/README.md). Navigasjon, fagtekst og evidens holdes statiske.

Visual Edit skal kjøre på `https://design.agent-native.com`, aldri en lokal Design-server. `.agent-native/design-routes.json` navngir tre faktiske visninger. Send alltid også `paths: ["/", "/new/example", "/privacy"]` til `open-visual-edit`; CLI-et legger ellers til Next-buildfiler som ekstra nettsider, selv med et manuelt manifest.

Appen krever sin egen innlogging. En signed-out Design-capability gir ikke tilgang til skolens kontoer. Ikke fjern autentisering eller presenter innloggingsskjermen som et ferdig produktcanvas; bruk en autentisert appøkt/integrasjon. Visual Edit er derfor ikke ferdig koblet i denne kjøringen.

## Avgrensning før skolepilot

Dette er en utviklingsversjon, ikke en produksjonsgodkjent skoletjeneste. Kildehenting er avgrenset til målets publiserte kildeutdrag, ikke en ferdig pgvector-/hybridsøkemotor. Feide, skoleadministrasjon, automatiske sletterutiner og enterprise-driftsoppsett er ikke implementert. Skoleeier må avklare DPIA, DPA, rettigheter, leverandørregioner, lagringstid og tilgjengelighet før ekte elevdata brukes.

Ingen Git-remote er konfigurert. Ingen PR eller deploy er gjort; arbeidet ligger lokalt på `feat/muntlig-experience`.
