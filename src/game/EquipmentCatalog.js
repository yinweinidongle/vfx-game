/** Appearance is deterministic and saved weapons retain their own blade family. */
export const WEAPON_KINDS=['dao','jian','bow'];
export const EQUIPMENT_FORMS=['玄器','灵宝','天阶'];
export function equipmentTier(item){return Math.max(item.level>=35?2:item.level>=20?1:0,item.enhance>=16?2:item.enhance>=8?1:0);}
export function weaponKind(item,kind){return kind==='ice'?'bow':item.weaponKind==='jian'?'jian':item.weaponKind==='bow'&&!kind?'bow':'dao';}
const families={
 armor:{ids:['armor-v1','armor-v1','armor-v1'],names:['玄玉战甲','玄玉战甲','玄玉战甲']},
 boots:{ids:['boots-v1','boots-v1','boots-v1'],names:['踏云战靴','踏云战靴','踏云战靴']},
 wings:{ids:['wings-v1','wings-star','wings-phoenix'],names:['琉光之翼','星羽天翼','九霄凤翼']},
 cloak:{ids:['cloak-v1','cloak-star','cloak-imperial'],names:['归墟披风','星河法衣','帝阙凤氅']},
 dao:{ids:['weapon-v1','weapon-v1','dao-imperial'],names:['斩星灵刀','苍龙斩月刀','帝龙镇天刀']},
 jian:{ids:['jian-base','jian-base','jian-imperial'],names:['苍雷长剑','天罡星剑','太初帝剑']},
 bow:{ids:['bow-base','bow-star','bow-imperial'],names:['寒霜弯弓','星龙灵弓','帝龙破穹弓']},
};
export const VARIANT_IDS=['wings-star','wings-phoenix','cloak-star','cloak-imperial','bow-star','bow-imperial','dao-imperial','jian-imperial'];
export function equipmentProfile(item,kind){const tier=equipmentTier(item),family=item.slot==='weapon'?weaponKind(item,kind):item.slot,f=families[family];return {id:f.ids[tier],name:f.names[tier],tier,family,form:EQUIPMENT_FORMS[tier]};}
export function equipmentIcon(item){const p=equipmentProfile(item);return p.id==='weapon-v1'?'weapon-v1':p.id;}
export const equipmentModelPath=id=>id==='bow-base'?'game/models/frost-bow-v2.glb':id==='jian-base'?'game/models/storm-sword-v3.glb':`game/models/equipment/${id}.glb`;
