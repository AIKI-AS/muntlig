import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishPack, startSession, applyReply, buildReview } from '../src/server/domain';
import type { Pack } from '../src/lib/contracts';

const pack: Pack = {
 id:'pack-a',title:'Demokrati og medborgerskap',subject:'Samfunnskunnskap',level:'VG1',description:'Maktfordeling',minutes:12,
 rights:'teacher_owned',status:'draft',version:1,createdAt:'2026-11-07T10:00:00Z',publishedAt:null,
 sources:[{id:'source-a',title:'Demokrati – egne notater',page:1,text:'Stortinget vedtar lover. Regjeringen utøver makt. Domstolene dømmer.'}],
 goals:['Forklare maktfordeling','Bruke eksempel','Drøfte svakheter'].map((title,index)=>({id:'goal-'+index,title,prompt:title,sourceIds:['source-a']})),
};

test('publisering avviser ukjente rettigheter og manglende mål eller kilde',()=>{
 assert.throws(()=>publishPack({...pack,rights:'unknown'}));
 assert.throws(()=>publishPack({...pack,goals:[]}));
 assert.throws(()=>publishPack({...pack,sources:[]}));
 assert.throws(()=>publishPack({...pack,goals:[{...pack.goals[0],sourceIds:['fremmed-kilde']}]}));
});

test('økt kan ikke starte fra utkast og isolerer publisert kildeversjon',()=>{
 assert.throws(()=>startSession(pack,'text'));
 const published=publishPack(pack);
 const session=startSession(published,'text');
 published.sources[0].text='En senere endring';
 assert.equal(session.pack.sources[0].text,pack.sources[0].text);
 assert.equal(session.packVersion,1);
});

test('KI-evidens må være et faktisk sitat fra denne elevens svar',()=>{
 const session=startSession(publishPack(pack),'text');
 const proposal={reply:'Kan du gi et eksempel?',sourceIds:['source-a'],goalId:'goal-0',hint:false,evidence:{status:'independent' as const,quote:'Jeg forklarte alt riktig',sourceIds:['source-a']}};
 assert.throws(()=>applyReply(session,'Jeg vet ikke.',proposal));
 assert.throws(()=>applyReply(session,'Stortinget vedtar lover.',{...proposal,evidence:{...proposal.evidence,quote:'Stortinget vedtar lover.',sourceIds:['fremmed-kilde']}}));
});

test('gjennomgangen viser elevens svar og lar uundersøkte mål stå uundersøkt',()=>{
 const session=startSession(publishPack(pack),'text');
 const answered=applyReply(session,'Stortinget vedtar lover.',{reply:'Hva gjør regjeringen?',sourceIds:['source-a'],goalId:'goal-0',hint:false,evidence:{status:'independent',quote:'Stortinget vedtar lover.',sourceIds:['source-a']}});
 const review=buildReview(answered);
 assert.equal(review.explored,1);
 assert.equal(review.goals[0].evidence?.quote,'Stortinget vedtar lover.');
 assert.equal(review.goals[0].evidence?.turnId,answered.turns.find(turn=>turn.role==='user')?.id);
 assert.equal(review.goals[1].evidence,null);
 assert.equal(review.goals[2].evidence,null);
});

test('avsluttet økt og fremmede modellkilder kan ikke endre evidens',()=>{
 const session=startSession(publishPack(pack),'text');
 const proposal={reply:'Forklar videre.',sourceIds:['utenfor-fagpakken'],goalId:'goal-0',hint:false,evidence:null};
 assert.throws(()=>applyReply(session,'Hei',proposal));
 assert.throws(()=>applyReply({...session,status:'completed'},'Hei',{...proposal,sourceIds:['source-a']}));
});
