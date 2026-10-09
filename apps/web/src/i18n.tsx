import {createContext, useContext, useEffect, useState, type ReactNode} from 'react';
import en from '../../api/app/locales/en-US.json';
import ja from '../../api/app/locales/ja-JP.json';
import zh from '../../api/app/locales/zh-CN.json';
export type Locale = 'en-US' | 'ja-JP' | 'zh-CN';
export type Translate = (key:string, values?:Record<string,string|number>)=>string;
const dictionaries: Record<Locale,Record<string,string>> = {'en-US':en,'ja-JP':ja,'zh-CN':zh};
export function translate(locale:Locale,key:string,values:Record<string,string|number>={}) {
 const text=dictionaries[locale][key] || dictionaries['en-US'][key] || key;
 return text.replace(/\{(\w+)\}/g,(token,name)=>String(values[name] ?? token));
}
const Context=createContext<{locale:Locale;setLocale:(locale:Locale)=>void;t:Translate}|null>(null);
export function I18nProvider({children}:{children:ReactNode}) {
 const [locale,setLocale]=useState<Locale>(()=>{try {const value=localStorage.getItem('tastetwin.language');return value&&value in dictionaries?value as Locale:'en-US';}catch{return 'en-US';}});
 useEffect(()=>{document.documentElement.lang=locale;document.title=translate(locale,'title');try{localStorage.setItem('tastetwin.language',locale);}catch{/* Storage may be disabled. */}},[locale]);
 return <Context.Provider value={{locale,setLocale,t:(key,values)=>translate(locale,key,values)}}>{children}</Context.Provider>;
}
export function useI18n(){const value=useContext(Context);if(!value)throw new Error('I18nProvider is required');return value;}
