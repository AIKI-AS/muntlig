# Muntlig

Skolestyrt muntlig fagtrening. Next.js, React, TypeScript, Supabase, OpenAI, ElevenLabs og LiveAvatar Lite.

## Arbeidskontrakt

Første leveranse er leverandørintegrert MVP. Den er ikke en skoleklar produksjonslansering. Ingen karakterer, ingen falsk eksamensprosent, ingen forhåndsskrevne KI-svar.

Tre avtalte testseams: kontrollert publisering, kildeversjonslåst økt og elevsvarforankret evidens. Testdata skal være syntetiske. Ingen rålyd/video lagres.

Arkitektur før bygging: ny kodebase, ingen eksisterende moduler å refaktorere. Én øktmodul eier overgangene, kildevalidering og gjennomgangen. Supabase-klienten bruker brukerens verifiserte identitet og RLS; ingen service-role i appen. En separat, privat skrivenøkkel sperrer direkte klientendringer av øktdata. Leverandører ligger bak serverruter; UI kjenner aldri permanente nøkler. Ingen generisk repository eller agentrammeverk.

`src/app/globals.css` inneholder bare tokens og grunnstiler. `src/app/styles/` deler resten i arbeidsrom, fagpakker, økter, tilgang og responsivitet. Importrekkefølgen er eksplisitt i rotlayouten. Oppdelingen bevarte CSS-innholdet byte for byte; desktopmål og mobilvisning er kontrollert etterpå.

## Lokalt

Node 22.22+, pnpm 10+, Docker for lokal Supabase. Appen lytter bare på `127.0.0.1:3210`.

Konfigurasjon injiseres i prosessen via godkjent secretprofil. Ikke opprett dekrypterte env-filer. Appen avviser tilgang ved manglende konfigurasjon. Leverandørkall krever separat kostnadsgodkjenning.

Opprett et eget loopback-bundet nettverk én gang; behold det hvis det allerede finnes:

```sh
docker network create --subnet 10.247.231.0/24 --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 muntlig-mvp-local
pnpm install --frozen-lockfile
pnpm db:start
pnpm dev
```

Supabase bruker eget prosjekt `muntlig-mvp`: API 56321, database 56322 og Studio 56323. Ikke erstatt eller nullstill andre lokale prosjekter. Migrasjoner kjøres ved første oppstart. `scripts/dev.mjs` henter bare denne lokale instansens konfigurasjon, holder skrivenøkkelen i prosessminnet og starter med alle eksterne leverandører avslått.

Kontoer opprettes administrativt; selvregistrering er avslått. `supabase/scripts/bootstrap-disposable-users.sql` oppretter syntetisk testskole, lærer og elev. Bruk egne, lokalt genererte passord via psql-variabler; ikke commit eller skriv dem i dokumentasjonen. `pnpm test:db` oppretter og rydder sine egne testkontoer automatisk.

## Leverandører

`pnpm dev --providers` tillater eksterne kall, men bare med godkjente nøkler injisert fra prosjektets egen secretprofil. Nøkler fra andre prosjekter skal ikke gjenbrukes. Ingen automatisk betalt fallback.

| Konfigurasjon | Bruk |
|---|---|
| `OPENAI_API_KEY`, valgfri `OPENAI_MODEL`, `OPENAI_BASE_URL` | Fagdialog og målforslag. Standardmodell `gpt-4.1-mini`. Kun godkjente OpenAI-endepunkter godtas. |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, valgfri `ELEVENLABS_BASE_URL` | Norsk transkripsjon og tale fra lagrede KI-turer. |
| `LIVEAVATAR_API_KEY`, `LIVEAVATAR_AVATAR_ID` | LiveAvatar Lite. Permanente nøkler blir på serveren. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MUNTLIG_DATABASE_WRITE_KEY` | Serverkonfigurasjon ved annen kjøring enn lokal `pnpm dev`; migrasjonene må være installert. |

Produksjonskjøring krever i tillegg `PROVIDER_CALLS_ENABLED=true`. En API-nøkkel alene aktiverer ingen leverandør. Manglende tilgang gir 503, ikke forhåndsskrevne svar.

Taleflyten er turbasert: opptak → transkripsjon til redigerbart svar → LLM → TTS, eventuelt med avatar. Dette er ikke ElevenAgents sin kontinuerlige realtime-samtale. Mikrofon og avspilling starter bare etter eksplisitt brukerhandling. Opptak stopper etter 90 sekunder; rålyd og avatarvideo lagres ikke av appen. Avataren bestilles med leverandørens dokumenterte grense på 600 sekunder; håndhevingen er ikke runtime-verifisert.

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

Utført 7. november 2026: 19 domenetester, typekontroll, lint og produksjonsbygg; database- og API-smoke; faktisk browserkontroll på desktop/mobil med kildevisning, modal/Escape/fokusretur og navigasjon. Dette beviser ikke ekte KI/tale/avatar: godkjent Muntlig-tilgang mangler. Ingen betalte leverandørkall eller ekte elevdata er brukt.

## Design og Visual Edit

[Bevegelsesgjennomgang og avviste kandidater](plans/README.md). Navigasjon, fagtekst og evidens holdes statiske.

Visual Edit skal kjøre på `https://design.agent-native.com`, aldri en lokal Design-server. `.agent-native/design-routes.json` navngir tre faktiske visninger. Send alltid også `paths: ["/", "/new/example", "/privacy"]` til `open-visual-edit`; CLI-et legger ellers til Next-buildfiler som ekstra nettsider, selv med et manuelt manifest.

Appen krever sin egen innlogging. En signed-out Design-capability gir ikke tilgang til skolens kontoer. Ikke fjern autentisering eller presenter innloggingsskjermen som et ferdig produktcanvas; bruk en autentisert appøkt/integrasjon. Visual Edit er derfor ikke ferdig koblet i denne kjøringen.

## Avgrensning før skolepilot

Dette er en utviklingsversjon, ikke en produksjonsgodkjent skoletjeneste. Kildehenting er avgrenset til målets publiserte kildeutdrag, ikke en ferdig pgvector-/hybridsøkemotor. Feide, skoleadministrasjon, automatiske sletterutiner og enterprise-driftsoppsett er ikke implementert. Skoleeier må avklare DPIA, DPA, rettigheter, leverandørregioner, lagringstid og tilgjengelighet før ekte elevdata brukes.

Ingen Git-remote er konfigurert. Ingen PR eller deploy er gjort; arbeidet ligger lokalt på `feat/muntlig-mvp`.
