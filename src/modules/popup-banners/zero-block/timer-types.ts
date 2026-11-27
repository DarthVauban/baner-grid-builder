export type TimerUnit='days'|'hours'|'minutes'|'seconds';
export type TimerStyleValue=string|number;
export type TimerContent={timer:{version:1;mode:'deadline'|'duration';endAt:number|null;timezone:string;durationSeconds:number;units:TimerUnit[];labels:Record<TimerUnit,string>;separator:string;showLabels:boolean;finish:'message'|'hide'|'close';finishText:string;base:Record<string,TimerStyleValue>;mobile?:Record<string,TimerStyleValue>;laptop?:Record<string,TimerStyleValue>;tablet?:Record<string,TimerStyleValue>;mobileLandscape?:Record<string,TimerStyleValue>}};
