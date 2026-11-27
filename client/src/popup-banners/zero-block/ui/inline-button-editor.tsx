'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check} from 'lucide-react';
import {Button} from './components';
import {validateButtonContent} from '@zero/button.mjs';
import {buttonCss,mountButtonContent} from '@zero/button-runtime.mjs';
import type {ButtonContent} from '@zero/button-types';
import type {PopupElement} from '../types';
import './text-editor.css';
type Props={element:PopupElement;device:'desktop'|'mobile';toolbarTarget?:HTMLElement|null;onChange:(content:ButtonContent)=>string|void;onFinish:()=>void;disabled?:boolean};
export function InlineButtonEditor({element,device,toolbarTarget,onChange,onFinish,disabled=false}:Props){
 const wrapper=useRef<HTMLDivElement>(null),toolbar=useRef<HTMLDivElement>(null),caption=useRef<HTMLElement|null>(null),mounted=useRef<ReturnType<typeof mountButtonContent>|null>(null),live=useRef({element,device,onChange,onFinish,disabled}),composing=useRef(false);
 const [error,setError]=useState('');const box=(device==='mobile'?element.mobile:element.desktop)||element.desktop;
 useLayoutEffect(()=>{live.current={element,device,onChange,onFinish,disabled};});
 function publish(){const area=caption.current;if(!area||composing.current)return false;try{const content={...live.current.element.content,text:area.innerText.replace(/\r\n?/g,'\n')} as ButtonContent;validateButtonContent(content);const failure=live.current.onChange(content);if(failure)throw new Error(failure);setError('');return true;}catch(failure){setError(failure instanceof Error?failure.message:'Перевірте підпис');return false;}}
 function finish(){if(publish())live.current.onFinish();}
 const actions=useRef({publish,finish});useLayoutEffect(()=>{actions.current={publish,finish};});
 useLayoutEffect(()=>{
  if(!wrapper.current)return;const host=wrapper.current;
  mounted.current=mountButtonContent(host,live.current.element,{device:live.current.device,mode:'editor',editing:true});const style=document.createElement('style');style.textContent=buttonCss;host.prepend(style);
  const area=mounted.current.caption as HTMLElement;caption.current=area;area.contentEditable=live.current.disabled?'false':'plaintext-only';area.setAttribute('role','textbox');area.setAttribute('aria-label','Редагування підпису кнопки на полотні');area.setAttribute('aria-multiline','true');
  const input=()=>{if(!composing.current)actions.current.publish();},start=()=>{composing.current=true;},end=()=>{composing.current=false;actions.current.publish();};
  const key=(event:globalThis.KeyboardEvent)=>{event.stopPropagation();if(event.isComposing)return;if(event.key==='Escape'||(event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();actions.current.finish();}};
  const paste=(event:ClipboardEvent)=>{event.preventDefault();const value=event.clipboardData?.getData('text/plain')||'';document.execCommand('insertText',false,value);actions.current.publish();};
  area.addEventListener('input',input);area.addEventListener('compositionstart',start);area.addEventListener('compositionend',end);area.addEventListener('keydown',key);area.addEventListener('paste',paste);area.focus({preventScroll:true});const range=document.createRange();range.selectNodeContents(area);range.collapse(false);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);
  return()=>{area.removeEventListener('input',input);area.removeEventListener('compositionstart',start);area.removeEventListener('compositionend',end);area.removeEventListener('keydown',key);area.removeEventListener('paste',paste);mounted.current?.destroy();mounted.current=null;caption.current=null;};
 },[]);
 useLayoutEffect(()=>{mounted.current?.layout(device,element);if(caption.current)caption.current.contentEditable=disabled?'false':'plaintext-only';},[element,device,disabled]);
 useLayoutEffect(()=>{caption.current?.setAttribute('aria-invalid',String(!!error));},[error]);
 useEffect(()=>{const outside=(event:Event)=>{const path=event.composedPath();if(path.includes(wrapper.current!)||path.includes(toolbar.current!)||path.some(node=>node instanceof HTMLElement&&node.matches('[role=dialog],[role=alertdialog],[role=listbox],[role=menu],[data-color-picker]')))return;actions.current.finish();};window.addEventListener('pointerdown',outside,true);window.addEventListener('focusin',outside,true);return()=>{window.removeEventListener('pointerdown',outside,true);window.removeEventListener('focusin',outside,true);};},[]);
 const ui=<div ref={toolbar} className="ui-inline-text-toolbar" role="toolbar" aria-label="Редагування підпису кнопки"><div className="ui-inline-text-actions"><span className="ui-text-hint">Підпис кнопки</span><Button size="sm" icon={<Check size={17}/>} disabled={disabled} onClick={finish}>Готово</Button></div>{error?<p role="alert" className="ui-text-error">{error}</p>:null}</div>;
 return <>{toolbarTarget?createPortal(ui,toolbarTarget):ui}<div ref={wrapper} className="ui-inline-button-box" style={{left:box.x,top:box.y}} onPointerDown={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()} onContextMenu={event=>event.stopPropagation()}/></>;
}
