import type { PackInput } from './contracts';
// Authored CC0 teaching notes. This is source material, never a scripted session.
export const examplePack: PackInput = {
 title:'Demokrati og medborgerskap', subject:'Samfunnskunnskap',level:'VG1',minutes:12,
 description:'Forklar hvordan makt fordeles, bruk et konkret eksempel og drøft hvorfor demokratiet trenger kontroll.',rights:'open_license',
 sources:[
 {id:'10000000-0000-4000-8000-000000000001',title:'Demokrati — åpent øvingsnotat (CC0)',page:1,text:'Maktfordeling betyr at statens makt ikke samles hos én aktør. I Norge vedtar Stortinget lover og statsbudsjett. Regjeringen gjennomfører politikk og leder den utøvende makten. Uavhengige domstoler avgjør rettstvister og straffesaker etter loven. Fordelingen gjør det vanskeligere å misbruke makt og gir institusjonene mulighet til å kontrollere hverandre.'},
 {id:'10000000-0000-4000-8000-000000000002',title:'Demokrati — åpent øvingsnotat (CC0)',page:2,text:'Parlamentarisme betyr at regjeringen må ha Stortingets tillit, eller i det minste ikke ha et flertall mot seg. Ved et mistillitsvedtak må regjeringen gå av. Parlamentarismen knytter den lovgivende og utøvende makten sammen; Norge har derfor ikke et absolutt skille mellom alle de tre statsmaktene. Domstolene skal likevel være uavhengige. Et konkret eksempel på kontroll er at Stortinget stiller spørsmål til regjeringen og kan vedta mistillit.'},
 {id:'10000000-0000-4000-8000-000000000003',title:'Demokrati — åpent øvingsnotat (CC0)',page:3,text:'Demokratisk kontroll kan beskytte rettigheter og hindre maktmisbruk. Samtidig kan kontrollordninger gjøre beslutninger langsommere. Flertallsstyre alene garanterer ikke vern av mindretall; rettigheter, uavhengige domstoler og en fri offentlig samtale er også viktige. En drøfting bør veie argumenter mot hverandre og bruke et eksempel, ikke bare liste fordeler.'},
 ],
 goals:[
 {id:'20000000-0000-4000-8000-000000000001',title:'Forklare maktfordeling med egne ord',prompt:'Hvorfor deler vi statsmakten mellom flere institusjoner?',sourceIds:['10000000-0000-4000-8000-000000000001']},
 {id:'20000000-0000-4000-8000-000000000002',title:'Bruke et konkret eksempel på demokratisk kontroll',prompt:'Hvordan kan Stortinget kontrollere regjeringen?',sourceIds:['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002']},
 {id:'20000000-0000-4000-8000-000000000003',title:'Drøfte fordeler og begrensninger',prompt:'Kan maktfordeling ha ulemper selv om den beskytter demokratiet?',sourceIds:['10000000-0000-4000-8000-000000000003']},
 ],
};
