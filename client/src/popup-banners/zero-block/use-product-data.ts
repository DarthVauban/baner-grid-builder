'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {zeroBlockApi} from './workspace-api';
import type {ProductData,ProductMap} from '@zero/product-types';
import {documentProductIds} from '@zero/product-bindings.mjs';
import type {PopupDocument} from './types';

export function useProductData(document:PopupDocument|null){
 const shopId=document?.shopId||'';
 const ids=JSON.stringify(documentProductIds(document).sort());
 const [state,setState]=useState<{shopId:string;products:ProductMap;error:string}>({shopId,products:{},error:''}),version=useRef(0),productsRef=useRef<ProductMap>({});
 useEffect(()=>{let live=true;const selected=JSON.parse(ids) as string[];async function refresh(){const current=++version.current;
  if(!selected.length){if(live&&current===version.current){productsRef.current={};setState({shopId,products:{},error:''});}return;}
  try{const products=await zeroBlockApi.products(selected);if(live&&current===version.current){productsRef.current=products;setState({shopId,products,error:''});}}
  catch(error){if(live&&current===version.current){productsRef.current={};setState({shopId,products:{},error:error instanceof Error?error.message:'Не вдалося отримати дані товарів'});}}
 }void Promise.resolve().then(refresh);const timer=selected.length?setInterval(()=>void refresh(),30000):null;return()=>{live=false;if(timer)clearInterval(timer);};},[shopId,ids]);
 const rememberProduct=useCallback((product:ProductData)=>{version.current++;productsRef.current={...productsRef.current,[product.id]:product};setState({shopId,products:productsRef.current,error:''});},[shopId]);
 return {products:state.shopId===shopId?state.products:{},productsRef,rememberProduct,error:state.shopId===shopId?state.error:''};
}
