import { createContext } from 'react';
export const ImageFallbackContext=createContext<{sessionId?:string;displayId?:string;revision?:number;preview?:boolean}>({});
