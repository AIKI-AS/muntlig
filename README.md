# Muntlig

Skolestyrt muntlig fagtrening. Next.js, React, TypeScript, Supabase, OpenAI, ElevenLabs og LiveAvatar Lite.

## Arbeidskontrakt

Første leveranse er leverandørintegrert MVP. Den er ikke en skoleklar produksjonslansering. Ingen karakterer, ingen falsk eksamensprosent, ingen forhåndsskrevne KI-svar.

Tre avtalte testseams: kontrollert publisering, kildeversjonslåst økt og elevsvarforankret evidens. Testdata skal være syntetiske. Ingen rålyd/video lagres.

Arkitektur før bygging: ny kodebase, ingen eksisterende modules å refaktorere. Ett øktmodule eier overgangene, kildevalidering og review. Supabase-klienten bruker brukerens verifiserte identitet og RLS; ingen service-role i appen. Leverandører ligger bak serverruter, UI kjenner aldri permanente nøkler. Ingen generisk repository eller agentrammeverk.

## Lokalt

Node 22+, pnpm 10+, Docker for lokal Supabase. Kjør pnpm install, pnpm db:start og pnpm dev. Appen lytter bare på 127.0.0.1:3210.

Konfigurasjon injiseres i prosessen via godkjent secretprofil. Ikke opprett dekrypterte env-filer. Appen avviser tilgang ved manglende konfigurasjon. Leverandørkall krever separat kostnadsgodkjenning.
