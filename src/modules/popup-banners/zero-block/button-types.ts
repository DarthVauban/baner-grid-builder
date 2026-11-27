import type {TextStyles} from './text-types';
import type {SvgIcon} from './svg-icon-types';
export type ButtonIcon={kind:'none'|'glyph'|'icon'|'emoji'|'image'|'svg';glyph:string;emoji:string;resourceId:string;svg?:SvgIcon};
export type ButtonStyles=Pick<TextStyles,'fontFamily'|'fontSize'|'fontWeight'|'color'|'align'|'lineHeight'|'lineHeightUnit'|'letterSpacing'|'letterCase'|'fit'|'opacity'|'rotation'|'flipX'|'flipY'|'background'|'padding'|'corners'|'border'|'shadows'>&{icon:ButtonIcon;hoverIcon:ButtonIcon;iconPosition:'before'|'after';iconSize:number;iconGap:number;iconWeight:'light'|'regular'|'semibold'|'bold';iconAnimation:string;hoverBackground:string;hoverColor:string;hoverBorderColor:string;hoverDuration:number};
export type ButtonContent={text:string;button?:{version:1;base:Partial<ButtonStyles>;mobile?:Partial<ButtonStyles>; laptop?:Partial<ButtonStyles>; tablet?:Partial<ButtonStyles>; mobileLandscape?:Partial<ButtonStyles>;locked?:boolean;nofollow?:boolean}};
