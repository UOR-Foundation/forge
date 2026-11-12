// FoundrySpecification.modulePresentationBoundary; this comparison grants no effects.
import {validateSpec} from './prism/spec.mjs';
import {checkView} from './live/project.mjs';
const interfaceOf=spec=>JSON.stringify({name:spec.name,fields:spec.fields.map(field=>field.kind==='choice'?{name:field.name,kind:field.kind,values:field.values}:{name:field.name,kind:field.kind,min:field.min??0,max:field.max}),outcomes:spec.outcomes});
export function modulePresentation(previous,incoming){
 let next;
 try{next=structuredClone(incoming);validateSpec(next);if(checkView(next).length)throw Error();}
 catch{return {code:'invalidCanonicalModule',error:'The canonical decision module is invalid or unsupported'};}
 if(previous===null||previous===undefined)return {spec:next,reset:false};
 try{
  const prior=structuredClone(previous);validateSpec(prior);
  if(checkView(prior).length||interfaceOf(prior)!==interfaceOf(next))return {spec:next,reset:true};
  const candidate=structuredClone(next);
  for(const key of ['purpose','view','meanings'])if(prior[key]!==undefined)candidate[key]=prior[key];
  validateSpec(candidate);
  return {spec:candidate,reset:false};
 }catch{return {spec:next,reset:true};}
}
