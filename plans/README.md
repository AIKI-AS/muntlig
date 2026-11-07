# Muntlig — bevegelsesgjennomgang

## Recon og eksisterende bevegelse

React 19 / Next.js, native HTML-dialoger og CSS. Ingen animasjonsbibliotek. Et rolig arbeidsrom for faglig konsentrasjon, ikke en markedsføringsside.

`src/app/globals.css:21–25` definerer `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`, `--press: 140ms`, `--surface-enter: 220ms`.

Eksisterende bevegelse: knappepress med `transform` og native modalinnslag med `opacity`/`transform`. Dialogen går fra `scale(0.98)` og `opacity: 0` til normal tilstand på 220ms med `var(--ease-out)`. Redusert bevegelse fjerner skalering og beholder 100ms lineær opacity-overgang. Hoverregler ligger bak `(hover: hover) and (pointer: fine)`. Ingen keyframes, layoutanimasjoner, `transition: all`, animert scrolling eller flyttende lesedata ble funnet i kildesveipet.

## improve-animations — prioritering

Ingen høyt prioriterte nye bevegelsestiltak anbefales på den verifiserbare flaten. Kildevisning, Escape og fokusretur er prøvd i browser. Følelsen i en ekte KI-samtale, taleavbrudd og avatarbytte er **ikke** verifisert: godkjent leverandørtilgang mangler. Denne rapporten er ikke en påstand om at de flatene er ferdig vurdert.

Alle åtte kategorier er gjennomgått statisk: formål/frekvens, kurve/varighet, opphav, avbrytbarhet, ytelse, tilgjengelighet, tokens og nye muligheter. Behold statisk navigasjon og tavle. Ingen korrigerende implementasjonsplaner er valgt; ingen animasjonskode er endret som del av rapporten.

## Part 1 — Opportunities table

| # | Location | Today | Purpose | Frequency | Suggested motion |
|---|---|---|---|---|---|

Ingen nye kandidater består hele porten med tilstrekkelig gevinst. Å legge til bevegelse bare fordi en overflate er statisk er ikke et produktforbedringskrav.

## Part 2 — Rejected candidates

- `src/features/workspace/muntlig-app.tsx` — sidebytte, mobilmeny og tastaturfokus. **Avvist ved frekvens:** kjernenavigasjon og tastaturhandlinger skal ikke bremses med animasjon.
- `src/features/workspace/practice.tsx:133–146` — tavlens kilder og aktivt mål. **Avvist ved funksjon:** eleven leser og bruker fagstoffet; dekorativ bevegelse flytter oppmerksomheten vekk fra forklaringen.
- `src/features/workspace/practice.tsx:51–54` — nye samtaleturer og scrolling. **Avvist ved frekvens/funksjon:** gjentatt bruk gjennom hele økten. Behold umiddelbar visning, ikke tekststagger eller skrivemaskin.
- `src/features/workspace/review.tsx` — feiring eller animert kompetanseprosent. **Avvist ved formål/funksjon:** produktet observerer konkrete svar, det sertifiserer ikke mestring. En feiring ville overdrive konklusjonen.
- `src/features/media/practice-media.css:1` — en konstant pulserende mikrofon eller lydbølge. **Avvist ved formål:** uten faktisk lydsignal er bevegelsen misvisende statuspynt. Native opptaksfremdrift er tilstrekkelig.

## Part 3 — Verdict

Denne flaten trenger lite bevegelse. Behold knappefeedback og de korte, sentrerte modalinnslagene; ikke animer navigasjon, fagtekst eller evidens. Høyest prioritet er å følelsesteste ekte taleavbrudd når tilgang finnes, ikke å legge på flere overganger nå. Handoff ved et konkret observert problem: `improve-animations plan <beskriv observert overgang>`.
