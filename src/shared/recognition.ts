/** Standard NATO words. Recognition labels are not authentication credentials. */
export const NATO_WORDS=['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel','india','juliett','kilo','lima','mike','november','oscar','papa','quebec','romeo','sierra','tango','uniform','victor','whiskey','x-ray','yankee','zulu'] as const;
export interface RequestContext {device:string;browser:string;language?:string;location?:import('./accounts.js').ApproximateLocation}
export function browserContext(userAgent:string,language?:string):RequestContext {
  const browser=/OPR\/|Opera\//.test(userAgent)?'Opera':/Edg(?:e|A|iOS)?\//.test(userAgent)?'Edge':/Firefox\/|FxiOS\//.test(userAgent)?'Firefox':/Chrome\/|CriOS\//.test(userAgent)?'Chrome':/Safari\//.test(userAgent)?'Safari':'Other browser';
  const device=/SmartTV|SMART-TV|Tizen|Web0S|webOS|BRAVIA|HbbTV/i.test(userAgent)?'TV':/iPad|Tablet/.test(userAgent)?'Tablet':/iPhone/.test(userAgent)?'iPhone':/Android/.test(userAgent)?'Android device':/Windows/.test(userAgent)?'Windows computer':/Macintosh/.test(userAgent)?'Mac':/Linux/.test(userAgent)?'Linux computer':'Browser';
  const candidate=language?.split(',')[0]?.split(';')[0]?.trim();
  return {device,browser,...(candidate&&/^[a-zA-Z0-9-]{1,35}$/.test(candidate)?{language:candidate}:{})};
}
