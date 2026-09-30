import { createContext, useContext } from 'react';
export const SelectionContext=createContext<{highlights:number[];indices?:number[]}>({highlights:[]});
export const useSelectedRow=(index:number)=>useContext(SelectionContext).highlights.includes(index);
export function useSelection(){return useContext(SelectionContext);}
