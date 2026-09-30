import { regionalDateTime } from '../../shared/regional';
import { createContext, useContext } from 'react';
import type { RegionalPreferences } from '../../shared/regional';
export const RegionalContext = createContext<RegionalPreferences>({});
export const useRegional = () => useContext(RegionalContext);

export function FormattedTime({value}:{value:string}){const preferences=useRegional();return <>{regionalDateTime(value,preferences)}</>;}
