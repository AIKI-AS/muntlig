import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Heading } from "./ui";
export function Privacy() {
  return (
    <div className="page privacy-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={15} />
        Arbeidsrom
      </Link>
      <Heading
        title="En tydelig ramme rundt øvingen."
        description="Dette er en utviklingsversjon, ikke en produksjonsgodkjent tjeneste for skolebruk."
      />
      <div className="privacy-sections">
        <section>
          <h2>Bruk bare oppdiktede elevopplysninger</h2>
          <p>
            Ikke bruk ekte elevdata, sensitive opplysninger eller materiale uten
            avklart rettighet. Skoleeier må godkjenne behandlingsgrunnlag,
            databehandleravtaler, DPIA, tilgjengelighet og lagringsrutiner før
            en pilot med elever.
          </p>
        </section>
        <section>
          <h2>Det vi lagrer</h2>
          <p>
            Fagpakker, mål, kildeversjoner, øktstatus, tekstinnlegg og
            strukturerte observasjoner. Opplysningene er knyttet til skolens og
            brukerens tilgang. Lærere får ikke lese elevers private økter i
            denne versjonen.
          </p>
        </section>
        <section>
          <h2>Tale og video</h2>
          <p>
            Appen lagrer ikke rålyd eller avatarvideo. I tale- og avatarøkter
            behandles lyd og fagdialog hos ElevenLabs. HeyGen LiveAvatar mottar
            trenerens lyd og leverer avatarvideo. Tekstøkter og målforslag
            behandles hos den konfigurerte språkmodellleverandøren.
            Leverandørenes behandlingssted, lagringstid og vilkår må vurderes
            før ekte skolebruk.
          </p>
        </section>
        <section>
          <h2>Ingen automatisk karakter</h2>
          <p>
            Gjennomgangen er KI-genererte observasjoner av konkrete tekstutdrag.
            Den er ikke en vurdering av eksamensberedskap eller en faglig
            godkjenning. Et uundersøkt mål forteller ikke hva eleven kan.
          </p>
        </section>
        <section>
          <h2>Kontroll og sletting</h2>
          <p>
            Administrator må fastsette lagringstid og håndtere innsyn og
            sletting i det aktuelle testmiljøet. Selvbetjent sletting, Feide og
            full administrasjon er ikke aktivert. Ikke bruk denne
            utviklingsversjonen som skolens offisielle dokumentasjonssystem.
          </p>
        </section>
      </div>
    </div>
  );
}
