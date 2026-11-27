export type SvgIconNode={tag:'g'|'path'|'circle'|'ellipse'|'rect'|'line'|'polyline'|'polygon';attrs:Record<string,string>;children?:SvgIconNode[]};
export type SvgIcon={viewBox:[number,number,number,number];attrs:Record<string,string>;children:SvgIconNode[]};
