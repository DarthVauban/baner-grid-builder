import {parsePaint,serializePaint} from './paint.mjs';

export const PAINT_PRESET_LIMIT=100;
/** Stable equality for private presets; only the existing bounded paint grammar is accepted. */
export function canonicalPresetPaint(value){
 const paint=parsePaint(value);if(!paint)return null;
 const color=value=>value.endsWith('FF')?value.slice(0,7):value;
 if(paint.type==='solid')paint.color=color(paint.color);
 else paint.stops=paint.stops.map(stop=>({...stop,color:color(stop.color)}));
 return serializePaint(paint);
}
