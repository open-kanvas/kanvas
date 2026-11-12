import type {ToastType} from '../shared/viewer-experience';
/** Nine generic, unbranded notification pictograms drawn here: no logos, no
 * brand colours, no fetched images. One stroke weight, currentColor. */
const shapes:Record<ToastType,React.ReactNode>={
 message:<path d="M4 5.5h16v10.5H10.5L6 19.5V16H4z"/>,
 email:<><rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="m3.5 7 8.5 6.5L20.5 7"/></>,
 success:<><circle cx="12" cy="12" r="9"/><path d="m7.5 12.5 3 3 6-6.5"/></>,
 warning:<><path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r=".4"/></>,
 error:<><circle cx="12" cy="12" r="9"/><path d="m8.5 8.5 7 7m0-7-7 7"/></>,
 info:<><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r=".4"/></>,
 calendar:<><rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 10h17M8 3v4m8-4v4"/></>,
 update:<><path d="M19.5 9A8 8 0 0 0 5 8.5"/><path d="M5 4v4.5h4.5"/><path d="M4.5 15A8 8 0 0 0 19 15.5"/><path d="M19 20v-4.5h-4.5"/></>,
 person:<><circle cx="12" cy="8" r="4"/><path d="M4 20.5c.8-4 4-6 8-6s7.2 2 8 6"/></>,
};
export function ToastIcon({type}:{type:ToastType}){
 return <svg className="viewer-toast-icon viewer-toast-builtin" data-toast-icon={type} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[type]}</svg>;
}
